using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Threading;
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

        private readonly string _dataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sunless");

        private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(20) };
        private HttpListener? _wsListener;
        private bool _closed;

        public MainWindow()
        {
            InitializeComponent();
        }

        private async void Window_Loaded(object sender, RoutedEventArgs e)
        {
            try
            {
                Directory.CreateDirectory(_dataDir);
                Log("Window loaded");

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
                    $"window.launcher = {{ port: {wsPort} }};");

                string webRoot = LocateWebRoot();
                WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    HostName, webRoot, CoreWebView2HostResourceAccessKind.Allow);

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
                string uri = args.Uri;
                if (uri.Contains(CabinetPath))
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
                string js = "localStorage.getItem('velka_token')||localStorage.getItem('token')||''";
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

        private static string LocateWebRoot()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string inOutput = Path.Combine(baseDir, "web");
            if (Directory.Exists(inOutput)) return inOutput;
            string projectDir = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", ".."));
            string inProject = Path.Combine(projectDir, "web");
            return Directory.Exists(inProject) ? inProject : inOutput;
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
                    HandleWsMessage(text);
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

        private void HandleWsMessage(string text)
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

                Dispatcher.Invoke(() =>
                {
                    switch (id)
                    {
                        case "hide":
                            WindowState = WindowState.Minimized;
                            break;
                        case "close":
                            Close();
                            break;
                        case "open_link":
                            OpenLink(message);
                            break;
                    }
                });
            }
            catch (Exception ex)
            {
                Log("WS parse error: " + ex.Message);
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