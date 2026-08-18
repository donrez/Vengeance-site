using System;
using System.IO;

namespace SunlessLauncher;

internal static class Log
{
    private static readonly object Lock = new();
    private static string? _path;

    private static string Path
    {
        get
        {
            if (_path == null)
            {
                try
                {
                    Directory.CreateDirectory(LauncherConfig.ConfigDir);
                    _path = System.IO.Path.Combine(LauncherConfig.ConfigDir, "launcher.log");
                }
                catch
                {
                    _path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "sunless_launcher.log");
                }
            }

            return _path;
        }
    }

    public static void Write(string message)
    {
        try
        {
            lock (Lock)
            {
                File.AppendAllText(Path, $"{DateTime.Now:HH:mm:ss.fff} {message}\r\n");
            }
        }
        catch
        {
        }
    }
}
