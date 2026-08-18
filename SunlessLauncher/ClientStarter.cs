using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;

namespace SunlessLauncher;

public class ClientStarter
{
    private readonly LauncherConfig _config;
    private readonly Action<string, int> _report;

    public ClientStarter(LauncherConfig config, Action<string, int> report)
    {
        _config = config;
        _report = report;
    }

    public async Task StartAsync(string memoryCount, string userName, string id)
    {
        try
        {
            _report("Проверка файлов...", 10);
            Directory.CreateDirectory(_config.ResolvedClientFolder);

            string jarPath = Path.Combine(_config.ResolvedClientFolder, _config.ClientFileName);
            bool needDownload = !File.Exists(jarPath);
            if (!needDownload && !string.IsNullOrEmpty(_config.ClientUrl))
            {
                needDownload = true;
            }

            if (!string.IsNullOrEmpty(_config.ClientUrl))
            {
                needDownload = true;
                await DownloadAsync(_config.ClientUrl, jarPath);
            }
            else
            {
                if (!File.Exists(jarPath))
                {
                    _report("Клиент не найден: укажите clientUrl в client-config.json", 100);
                    return;
                }

                _report("Файлы на месте...", 40);
            }

            _report("Загрузка библиотек...", 70);

            string java = string.IsNullOrWhiteSpace(_config.JavaPath)
                ? "java"
                : _config.JavaPath;

            var psi = new ProcessStartInfo
            {
                FileName = java,
                UseShellExecute = false,
                WorkingDirectory = _config.ResolvedClientFolder
            };
            psi.ArgumentList.Add($"-Xmx{memoryCount}M");
            psi.ArgumentList.Add("-jar");
            psi.ArgumentList.Add(jarPath);
            psi.ArgumentList.Add(userName);
            psi.ArgumentList.Add(id);

            _report("Запуск JVM...", 90);
            Process.Start(psi);
            _report("Запуск клиента...", 100);
        }
        catch (Exception ex)
        {
            _report($"Ошибка запуска: {ex.Message}", 100);
        }
    }

    private async Task DownloadAsync(string url, string destPath)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(30) };
        using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();
        long total = response.Content.Headers.ContentLength ?? 0;
        string tmp = destPath + ".part";
        await using (var fs = new FileStream(tmp, FileMode.Create, FileAccess.Write, FileShare.None, 81920, true))
        {
            await using var stream = await response.Content.ReadAsStreamAsync();
            var buffer = new byte[81920];
            long done = 0;
            int read;
            int lastReport = -1;
            while ((read = await stream.ReadAsync(buffer)) > 0)
            {
                await fs.WriteAsync(buffer.AsMemory(0, read));
                done += read;
                if (total > 0)
                {
                    int pct = (int)(20 + 50 * done / total);
                    if (pct != lastReport)
                    {
                        lastReport = pct;
                        _report($"Скачивание клиента... {done / 1048576} МБ", pct);
                    }
                }
            }
        }

        if (File.Exists(destPath))
        {
            File.Delete(destPath);
        }

        File.Move(tmp, destPath);
    }
}
