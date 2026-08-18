using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.WebSockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Interop;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;

namespace Sunless
{
    public partial class MainWindow : Window
    {
        private const string SiteBase = "https://sunlesss.vercel.app";
        private const string ApiBase = SiteBase + "/api";
        private const string HostName = "launcher.local";
        private const string AuthPath = "/launcher/auth";
        private const string CabinetPath = "/launcher/cabinet";
        private const string ClientVersion = "1.21.4";
        private const int MaxMemory = 16384;

        private readonly string _dataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sunless");

        private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(20) };
        private HttpListener? _wsListener;
        private bool _closed;
        private readonly string _hwid = ComputeHwid();
        private Dictionary<string, string>? _resources;

        [DllImport("user32.dll")] private static extern bool SetWindowRgn(IntPtr hWnd, IntPtr hRgn, bool bRedraw);
        [DllImport("gdi32.dll")] private static extern IntPtr CreateRoundRectRgn(int x1, int y1, int x2, int y2, int cx, int cy);

        public MainWindow()
        {
            InitializeComponent();
        }

        private void Window_SourceInitialized(object? sender, EventArgs e)
        {
            var src = (HwndSource)PresentationSource.FromVisual(this)!;
            var rgn = CreateRoundRectRgn(0, 0, (int)Width, (int)Height, 32, 32);
            SetWindowRgn(src.Handle, rgn, true);
        }

        private async void Window_Loaded(object sender, RoutedEventArgs e)
        {
            try
            {
                Directory.CreateDirectory(_dataDir);
                Log("Window loaded, hwid=" + _hwid);

                _resources = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (string name in Assembly.GetExecutingAssembly().GetManifestResourceNames())
                {
                    _resources[name.Replace('\\', '/')] = name;
                }
                Log("Embedded resources: " + _resources.Count);

                await WebView.EnsureCoreWebView2Async();

                WebView.DefaultBackgroundColor = System.Drawing.Color.FromArgb(255, 17, 25, 39);
                WebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                WebView.CoreWebView2.Settings.AreDevToolsEnabled = false;
                WebView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                WebView.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;
                WebView.CoreWebView2.Settings.IsGeneralAutofillEnabled = false;
                WebView.CoreWebView2.Settings.IsPasswordAutosaveEnabled = false;

                int wsPort = FindFreePort();
                await StartWsServerAsync(wsPort);
                await WebView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                    "window.launcher={port:" + wsPort + ",hwid:" + JsonSerializer.Serialize(_hwid)
                    + ",default_folder:" + JsonSerializer.Serialize(DefaultFolder())
                    + ",version:" + JsonSerializer.Serialize(ClientVersion)
                    + ",max_memory:" + MaxMemory + "};");

                WebView.CoreWebView2.AddWebResourceRequestedFilter("https://" + HostName + "/*",
                    CoreWebView2WebResourceContext.All);
                WebView.CoreWebView2.WebResourceRequested += OnWebResourceRequested;

                WebView.CoreWebView2.NavigationStarting += OnNavigationStarting;

                await InitializeEntryAsync();
            }
            catch (Exception ex)
            {
                Log("Init error: " + ex);
            }
        }

        private async Task InitializeEntryAsync()
        {
            string? token = ReadSessionToken();
            if (!string.IsNullOrEmpty(token) && await IsTokenValidAsync(token))
            {
                Log("Valid session found, opening launcher UI");
                NavigateLocal();
            }
            else
            {
                if (!string.IsNullOrEmpty(token))
                {
                    Log("Session invalid, clearing");
                    DeleteSession();
                }
                Log("No session, opening site login: " + SiteBase + AuthPath);
                WebView.CoreWebView2.Navigate(SiteBase + AuthPath);
            }
        }

        private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs args)
        {
            try
            {
                if (args.Uri.Contains(CabinetPath))
                {
                    _ = HandleSiteLoginAsync(args);
                }
            }
            catch (Exception ex)
            {
                Log("Nav error: " + ex.Message);
            }
        }

        private async Task HandleSiteLoginAsync(CoreWebView2NavigationStartingEventArgs args)
        {
            try
            {
                string js = "(localStorage.getItem('velka_token')||localStorage.getItem('token')||sessionStorage.getItem('velka_token')||sessionStorage.getItem('token')||'')";
                string raw = await WebView.CoreWebView2.ExecuteScriptAsync(js);
                string? token = null;
                try
                {
                    token = JsonSerializer.Deserialize<string>(raw);
                }
                catch
                {
                }

                if (string.IsNullOrEmpty(token))
                {
                    Log("Login detected but no token found");
                    return;
                }

                Log("Site login OK, token captured");
                SaveSession(token);
                if (_closed) return;
                Dispatcher.Invoke(() =>
                {
                    args.Cancel = true;
                    NavigateLocal();
                });
            }
            catch (Exception ex)
            {
                Log("Site login error: " + ex.Message);
            }
        }

        private void NavigateLocal()
        {
            Log("Navigating to launcher UI: https://" + HostName + "/index.html");
            WebView.CoreWebView2.Navigate("https://" + HostName + "/index.html");
        }

        private void OnWebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs args)
        {
            try
            {
                string uri = args.Request.Uri;
                string path = uri.Substring(uri.IndexOf("//", StringComparison.Ordinal) + 2);
                int slash = path.IndexOf('/');
                if (slash < 0) return;
                string rel = path.Substring(slash + 1);
                int q = rel.IndexOf('?');
                if (q >= 0) rel = rel.Substring(0, q);
                if (rel.Length == 0) rel = "index.html";

                string targetName = "web." + (rel.Contains('/')
                    ? rel.Substring(0, rel.IndexOf('/')) + rel.Substring(rel.IndexOf('/'))
                    : rel);
                if (_resources == null || !_resources.TryGetValue(targetName, out string? actualName))
                {
                    Log("Resource not found: " + targetName);
                    args.Response = null;
                    return;
                }

                Stream? stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(actualName);
                if (stream == null)
                {
                    Log("Resource open failed: " + targetName);
                    args.Response = null;
                    return;
                }

                using var ms = new MemoryStream();
                stream.CopyTo(ms);
                args.Response = WebView.CoreWebView2.Environment.CreateWebResourceResponse(
                    new MemoryStream(ms.ToArray()), 200, "OK", "Content-Type: " + MimeFor(rel) + "\r\nAccess-Control-Allow-Origin: *");
            }
            catch (Exception ex)
            {
                Log("WebResource error: " + ex.Message);
            }
        }

        private static string MimeFor(string rel)
        {
            string ext = Path.GetExtension(rel).ToLowerInvariant();
            return ext switch
            {
                ".html" => "text/html; charset=utf-8",
                ".js" => "text/javascript; charset=utf-8",
                ".css" => "text/css; charset=utf-8",
                ".svg" => "image/svg+xml",
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".ico" => "image/x-icon",
                ".woff" => "font/woff",
                ".woff2" => "font/woff2",
                ".json" => "application/json",
                _ => "application/octet-stream",
            };
        }

        private async Task<bool> IsTokenValidAsync(string token)
        {
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, ApiBase + "/user/profile");
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                using var response = await _http.SendAsync(request);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                Log("Token check error: " + ex.Message);
                return false;
            }
        }

        private string? ReadSessionToken()
        {
            try
            {
                string file = Path.Combine(_dataDir, "session.json");
                if (!File.Exists(file)) return null;
                using var doc = JsonDocument.Parse(File.ReadAllText(file));
                return doc.RootElement.TryGetProperty("token", out var t) ? t.GetString() : null;
            }
            catch
            {
                return null;
            }
        }

        private void SaveSession(string token)
        {
            try
            {
                File.WriteAllText(Path.Combine(_dataDir, "session.json"),
                    JsonSerializer.Serialize(new { token }));
            }
            catch (Exception ex)
            {
                Log("Save session error: " + ex.Message);
            }
        }

        private void DeleteSession()
        {
            try
            {
                string file = Path.Combine(_dataDir, "session.json");
                if (File.Exists(file)) File.Delete(file);
            }
            catch
            {
            }
        }

        private static string DefaultFolder()
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sunless", "client");
        }

        private static string ComputeHwid()
        {
            try
            {
                string machineGuid = "";
                using (var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography"))
                {
                    if (key != null) machineGuid = key.GetValue("MachineGuid")?.ToString() ?? "";
                }
                string raw = machineGuid + "|" + Environment.MachineName;
                byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
                return Convert.ToHexString(hash).ToLowerInvariant();
            }
            catch
            {
                return "0000000000000000000000000000000000000000";
            }
        }

        private static int FindFreePort()
        {
            var listener = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            listener.Stop();
            return port;
        }

        private async Task StartWsServerAsync(int port)
        {
            try
            {
                _wsListener = new HttpListener();
                _wsListener.Prefixes.Add("http://localhost:" + port + "/");
                _wsListener.Start();
                Log("WS server on port " + port);
                _ = Task.Run(async () =>
                {
                    while (!_closed)
                    {
                        try
                        {
                            var ctx = await _wsListener.GetContextAsync();
                            if (ctx.Request.IsWebSocketRequest)
                            {
                                var wsCtx = await ctx.AcceptWebSocketAsync(null);
                                _ = HandleWsConnectionAsync(wsCtx.WebSocket);
                            }
                            else
                            {
                                ctx.Response.StatusCode = 400;
                                ctx.Response.Close();
                            }
                        }
                        catch
                        {
                            if (_closed) break;
                        }
                    }
                });
            }
            catch (Exception ex)
            {
                Log("WS start error: " + ex.Message);
            }
        }

        private async Task HandleWsConnectionAsync(WebSocket ws)
        {
            var buffer = new byte[65536];
            try
            {
                while (ws.State == WebSocketState.Open && !_closed)
                {
                    var result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                    if (result.MessageType == WebSocketMessageType.Close) break;
                    if (result.MessageType != WebSocketMessageType.Text) continue;
                    string text = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    HandleWsMessage(text, ws);
                }
            }
            catch
            {
            }
            finally
            {
                try { ws.Dispose(); } catch { }
            }
        }

        private void HandleWsMessage(string text, WebSocket ws)
        {
            try
            {
                using var doc = JsonDocument.Parse(text);
                string id = doc.RootElement.TryGetProperty("id", out var idEl)
                    ? idEl.GetString() ?? ""
                    : "";
                JsonElement message = doc.RootElement.TryGetProperty("message", out var m)
                    ? m
                    : default;

                Log("WS msg: " + id);

                switch (id)
                {
                    case "hide":
                        Dispatcher.Invoke(() => WindowState = WindowState.Minimized);
                        break;
                    case "close":
                        Dispatcher.Invoke(Close);
                        break;
                    case "open_link":
                        Dispatcher.Invoke(() => OpenLink(message));
                        break;
                    case "drag":
                        Dispatcher.Invoke(() =>
                        {
                            try { DragMove(); } catch { }
                        });
                        break;
                    case "auth":
                        Respond(ws, "auth", new { token = ReadSessionToken() });
                        break;
                    case "open_folder":
                        Dispatcher.Invoke(() => OpenExplorer(message));
                        break;
                    case "edit_folder":
                        Dispatcher.Invoke(async () => await PickFolderAsync(ws));
                        break;
                    case "download":
                        Respond(ws, "download", new
                        {
                            stage = "error",
                            data = new { status = "error", message = "Скачивание клиента пока недоступно. Ожидайте обновление лаунчера." },
                        });
                        break;
                    case "start":
                        Respond(ws, "start", new { success = false, message = "Клиент не установлен." });
                        break;
                    default:
                        Log("Unknown message id: " + id);
                        break;
                }
            }
            catch (Exception ex)
            {
                Log("WS parse error: " + ex.Message);
            }
        }

        private void Respond(WebSocket ws, string id, object payload)
        {
            try
            {
                string json = JsonSerializer.Serialize(new { id, message = payload });
                byte[] bytes = Encoding.UTF8.GetBytes(json);
                ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None)
                  .GetAwaiter().GetResult();
                Log("WS sent: " + id);
            }
            catch (Exception ex)
            {
                Log("WS send error: " + ex.Message);
            }
        }

        private void OpenLink(JsonElement message)
        {
            try
            {
                string? url = null;
                if (message.ValueKind == JsonValueKind.String)
                {
                    url = message.GetString();
                }
                else if (message.ValueKind == JsonValueKind.Object &&
                         message.TryGetProperty("url", out var u) && u.ValueKind == JsonValueKind.String)
                {
                    url = u.GetString();
                }
                if (string.IsNullOrEmpty(url)) url = SiteBase;
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                Log("Open link error: " + ex.Message);
            }
        }

        private void OpenExplorer(JsonElement message)
        {
            try
            {
                string? folder = null;
                if (message.ValueKind == JsonValueKind.Object &&
                    message.TryGetProperty("folder", out var f) && f.ValueKind == JsonValueKind.String)
                {
                    folder = f.GetString();
                }
                folder ??= DefaultFolder();
                Directory.CreateDirectory(folder);
                Process.Start(new ProcessStartInfo("explorer.exe", "\"" + folder + "\"") { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                Log("Open explorer error: " + ex.Message);
            }
        }

        private async Task PickFolderAsync(WebSocket ws)
        {
            try
            {
                var dlg = new OpenFolderDialog
                {
                    Title = "Выберите папку для клиента",
                    Multiselect = false,
                    InitialDirectory = DefaultFolder(),
                };
                bool? ok = dlg.ShowDialog(this);
                if (ok == true)
                {
                    Respond(ws, "edit_folder", new { new_folder = dlg.FolderName });
                }
                else
                {
                    Respond(ws, "edit_folder", new { new_folder = ReadFolderSetting() ?? DefaultFolder() });
                }
            }
            catch (Exception ex)
            {
                Log("Pick folder error: " + ex.Message);
                Respond(ws, "edit_folder", new { new_folder = DefaultFolder() });
            }
        }

        private string? ReadFolderSetting()
        {
            try
            {
                string file = Path.Combine(_dataDir, "folder.txt");
                return File.Exists(file) ? File.ReadAllText(file).Trim() : null;
            }
            catch
            {
                return null;
            }
        }

        protected override void OnClosed(EventArgs e)
        {
            _closed = true;
            try { _wsListener?.Stop(); } catch { }
            _http.Dispose();
            base.OnClosed(e);
        }

        private void Log(string message)
        {
            try
            {
                File.AppendAllText(Path.Combine(_dataDir, "launcher.log"),
                    DateTime.Now.ToString("HH:mm:ss.fff") + " " + message + "\r\n");
            }
            catch
            {
            }
        }
    }
}