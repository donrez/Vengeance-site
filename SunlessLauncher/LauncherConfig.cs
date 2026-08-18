using System;
using System.IO;
using System.Text.Json;

namespace SunlessLauncher;

public class LauncherConfig
{
    public string ApiBase { get; set; } = "https://sunlesss.vercel.app/api";
    public string ClientName { get; set; } = "Sunless";
    public string ClientColor { get; set; } = "#5865F2";
    public string Versions { get; set; } = "ZielK8vVnb:Stable 1.21.11:0;";
    public string ClientUrl { get; set; } = "";
    public string ClientFileName { get; set; } = "client.jar";
    public string JavaPath { get; set; } = "";
    public string ClientFolder { get; set; } = "%APPDATA%\\SunlessLauncher\\clients";
    public string ForgotUrl { get; set; } = "https://sunlesss.vercel.app/reset-password";
    public int RamDefault { get; set; } = 2048;
    public int RamMax { get; set; } = 16000;

    public static string ConfigDir => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "SunlessLauncher");

    public string SessionFile => Path.Combine(ConfigDir, "session.json");

    public static string ExeDir => AppContext.BaseDirectory;

    public string WebRoot => Path.Combine(ExeDir, "web");

    public string ResolvedClientFolder => Environment.ExpandEnvironmentVariables(ClientFolder);

    public static LauncherConfig Load()
    {
        string path = Path.Combine(ExeDir, "client-config.json");
        if (File.Exists(path))
        {
            try
            {
                return JsonSerializer.Deserialize<LauncherConfig>(File.ReadAllText(path)) ?? new LauncherConfig();
            }
            catch
            {
                return new LauncherConfig();
            }
        }

        var cfg = new LauncherConfig();
        try
        {
            File.WriteAllText(path, JsonSerializer.Serialize(cfg, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch
        {
        }

        return cfg;
    }
}
