using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SunlessLauncher;

public class MainForm : Form
{
    private const string HostName = "launcher.local";

    private readonly LauncherConfig _config = LauncherConfig.Load();
    private readonly WebView2 _webView = new();
    private ApiClient? _api;
    private string? _token;
    private bool _initialized;

    public MainForm()
    {
        Text = "Sunless Launcher";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(800, 480);
        BackColor = Color.FromArgb(20, 20, 28);
        ShowInTaskbar = true;

        _webView.Dock = DockStyle.Fill;
        Controls.Add(_webView);

        Load += async (_, _) => await InitializeWebViewAsync();
    }

    private string GetHwid()
    {
        try
        {
            string input = Environment.MachineName + "|" + Environment.UserName + "|" +
                           (Environment.GetEnvironmentVariable("PROCESSOR_IDENTIFIER") ?? "");
            using var sha = SHA256.Create();
            byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(input));
            return "HWID-" + Convert.ToHexString(hash).Substring(0, 8);
        }
        catch
        {
            return "HWID-00000000";
        }
    }

    private async Task InitializeWebViewAsync()
    {
        string userDataFolder = Path.Combine(LauncherConfig.ConfigDir, "WebView2");
        Directory.CreateDirectory(userDataFolder);
        Log.Write("Initializing WebView2, web root: " + _config.WebRoot);

        var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
        await _webView.EnsureCoreWebView2Async(env);

        _api = new ApiClient(_config.ApiBase, GetHwid());

        _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
            HostName, _config.WebRoot, CoreWebView2HostResourceAccessKind.Allow);

        _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
        _webView.CoreWebView2.NavigationCompleted += async (_, e) =>
        {
            Log.Write($"NavigationCompleted success={e.IsSuccess} uri={_webView.CoreWebView2.Source}");
            if (e.IsSuccess && !_initialized)
            {
                _initialized = true;
                await TryAutoLoginAsync();
            }
        };

        _webView.CoreWebView2.Navigate($"https://{HostName}/index.html");
        Log.Write("Navigating to launcher.local/index.html");
    }

    private async Task TryAutoLoginAsync()
    {
        string sessionFile = _config.SessionFile;
        if (File.Exists(sessionFile))
        {
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(sessionFile));
                string? token = doc.RootElement.TryGetProperty("token", out var t) ? t.GetString() : null;
                if (!string.IsNullOrEmpty(token) && _api != null)
                {
                    var (ok, profile, _) = await _api.GetProfileAsync(token);
                    if (ok && profile != null)
                    {
                        _token = token;
                        Log.Write("Auto-login OK as " + profile.Username);
                        string till = profile.Subscription == "none" || string.IsNullOrEmpty(profile.Subscription)
                            ? "0"
                            : FormatDate(profile.Subscription);
                        SendAction("AUTHORIZE_STATE", new
                        {
                            state = "OK",
                            till,
                            username = profile.Username,
                            id = profile.Id,
                            priority = 0,
                            versions = _config.Versions
                        });
                        return;
                    }
                }
            }
            catch
            {
            }
        }

        SendClientInformation("");
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string json = e.WebMessageAsJson;
        try
        {
            using var doc = JsonDocument.Parse(json);
            JsonElement root = doc.RootElement;

            if (root.TryGetProperty("type", out var typeEl))
            {
                string type = typeEl.GetString() ?? "";
                HandleDragMessage(type, root);
                return;
            }

            if (!root.TryGetProperty("action", out var actionEl))
            {
                return;
            }

            string action = actionEl.GetString() ?? "";
            Log.Write("Message from UI: " + action);
            JsonElement value = root.TryGetProperty("value", out var v) ? v : default;
            switch (action)
            {
                case "INITIALIZE_LAUNCHER":
                    SendClientInformation(CurrentUserName());
                    _ = TryAutoLoginIfSessionAsync();
                    break;
                case "TRYING_AUTHORIZATION":
                    _ = TryAutoLoginIfSessionAsync();
                    break;
                case "AUTHORIZE_USER":
                    _ = HandleAuthorizeAsync(value);
                    break;
                case "START_CLIENT":
                    _ = HandleStartClientAsync(value);
                    break;
                case "WINDOW_EXIT":
                    Close();
                    break;
                case "WINDOW_MINIMIZE":
                    WindowState = FormWindowState.Minimized;
                    break;
                case "OPEN_FORGOT_URL":
                    OpenUrl(_config.ForgotUrl);
                    break;
                case "OPEN_CLIENT_RESOURCES":
                    Directory.CreateDirectory(_config.ResolvedClientFolder);
                    Process.Start("explorer.exe", _config.ResolvedClientFolder);
                    break;
            }
        }
        catch
        {
        }
    }

    private string CurrentUserName()
    {
        try
        {
            string sessionFile = _config.SessionFile;
            if (File.Exists(sessionFile))
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(sessionFile));
                return doc.RootElement.TryGetProperty("username", out var u) ? u.GetString() ?? "" : "";
            }
        }
        catch
        {
        }

        return "";
    }

    private async Task TryAutoLoginIfSessionAsync()
    {
        string sessionFile = _config.SessionFile;
        if (File.Exists(sessionFile) && _api != null)
        {
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(sessionFile));
                string? token = doc.RootElement.TryGetProperty("token", out var t) ? t.GetString() : null;
                if (!string.IsNullOrEmpty(token))
                {
                    var (ok, profile, _) = await _api.GetProfileAsync(token);
                    if (ok && profile != null)
                    {
                        _token = token;
                        Log.Write("Auto-login OK as " + profile.Username);
                        string till = profile.Subscription == "none" || string.IsNullOrEmpty(profile.Subscription)
                            ? "0"
                            : FormatDate(profile.Subscription);
                        SendAction("AUTHORIZE_STATE", new
                        {
                            state = "OK",
                            till,
                            username = profile.Username,
                            id = profile.Id,
                            priority = 0,
                            versions = _config.Versions
                        });
                        return;
                    }
                }
            }
            catch
            {
            }
        }

        SendClientInformation(CurrentUserName());
    }

    private async Task HandleAuthorizeAsync(JsonElement value)
    {
        if (_api == null)
        {
            return;
        }

        string userName = value.TryGetProperty("userName", out var u) ? u.GetString() ?? "" : "";
        string authKey = value.TryGetProperty("authKey", out var p) ? p.GetString() ?? "" : "";

        var (ok, token, message) = await _api.LoginAsync(userName, authKey);
        Log.Write($"AUTHORIZE_USER login result: ok={ok} msg={message}");
        if (!ok)
        {
            SendAction("AUTHORIZE_STATE", new { state = "ERROR", message });
            return;
        }

        var (profileOk, profile, profileMessage) = await _api.GetProfileAsync(token);
        Log.Write($"AUTHORIZE_USER profile: ok={profileOk} user={profile?.Username} sub={profile?.Subscription}");
        if (!profileOk || profile == null)
        {
            SendAction("AUTHORIZE_STATE", new { state = "ERROR", message = profileMessage });
            return;
        }

        _token = token;
        try
        {
            File.WriteAllText(_config.SessionFile,
                JsonSerializer.Serialize(new { username = profile.Username, token }));
        }
        catch
        {
        }

        string till = profile.Subscription == "none" || string.IsNullOrEmpty(profile.Subscription)
            ? "0"
            : FormatDate(profile.Subscription);

        SendAction("AUTHORIZE_STATE", new
        {
            state = "OK",
            till,
            username = profile.Username,
            id = profile.Id,
            priority = 0,
            versions = _config.Versions
        });
    }

    private Task HandleStartClientAsync(JsonElement value)
    {
        string memory = value.TryGetProperty("memoryCount", out var m) ? m.GetString() ?? "2048" : "2048";
        string userName = value.TryGetProperty("userName", out var u) ? u.GetString() ?? "" : "";
        string id = value.TryGetProperty("id", out var i) ? i.GetString() ?? "" : "";
        var starter = new ClientStarter(_config, (status, percent) =>
            SendAction("CHANGE_LOADER_TEXT_WITH_PERCENT", new { status, percent }));
        return starter.StartAsync(memory, userName, id);
    }

    private void HandleDragMessage(string type, JsonElement root)
    {
        try
        {
            if (type == "start_drag")
            {
                return;
            }

            if (type == "dragging" && root.TryGetProperty("deltaX", out var dx) &&
                root.TryGetProperty("deltaY", out var dy))
            {
                Location = new Point(Location.X + dx.GetInt32(), Location.Y + dy.GetInt32());
            }
        }
        catch
        {
        }
    }

    private static string FormatDate(string iso)
    {
        if (DateTime.TryParse(iso, out var dt))
        {
            return dt.ToLocalTime().ToString("dd.MM.yyyy");
        }

        return iso;
    }

    private void SendClientInformation(string userName)
    {
        SendAction("INITIALIZE_CLIENT_INFORMATION", new
        {
            memoryCount = _config.RamDefault,
            maxMemoryCount = _config.RamMax,
            clientName = _config.ClientName,
            userName = string.IsNullOrEmpty(userName) ? "sunless" : userName,
            clientColor = _config.ClientColor
        });
    }

    private void SendAction(string action, object value)
    {
        try
        {
            string json = JsonSerializer.Serialize(new { action, value });
            _webView.CoreWebView2?.PostWebMessageAsJson(json);
        }
        catch
        {
        }
    }

    private static void OpenUrl(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch
        {
        }
    }
}
