using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace SunlessLauncher;

public class ApiClient
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };
    private readonly HttpClient _http;

    public ApiClient(string apiBase, string hwid)
    {
        _http = new HttpClient
        {
            BaseAddress = new Uri(apiBase.EndsWith("/") ? apiBase : apiBase + "/"),
            Timeout = TimeSpan.FromSeconds(30)
        };
        _http.DefaultRequestHeaders.Add("x-hwid", hwid);
    }

    public async Task<(bool ok, string token, string message)> LoginAsync(string username, string password)
    {
        var body = new { username, password };
        using var response = await _http.PostAsync("auth/login",
            new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"));
        string text = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            return (false, "", TryGetMessage(text) ?? "Неверный логин или пароль");
        }

        using var doc = JsonDocument.Parse(text);
        string? token = doc.RootElement.TryGetProperty("token", out var t) ? t.GetString() : null;
        return string.IsNullOrEmpty(token) ? (false, "", "Сервер не вернул токен") : (true, token, "");
    }

    public async Task<(bool ok, Profile? profile, string message)> GetProfileAsync(string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "user/profile");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await _http.SendAsync(request);
        string text = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            return (false, null, TryGetMessage(text) ?? "Ошибка получения профиля");
        }

        try
        {
            return (true, JsonSerializer.Deserialize<Profile>(text, JsonOpts), "");
        }
        catch
        {
            return (false, null, "Некорректный ответ сервера");
        }
    }

    public async Task<string> GetSubscriptionUntilAsync(string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "user/sub");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await _http.SendAsync(request);
        string text = await response.Content.ReadAsStringAsync();
        try
        {
            using var doc = JsonDocument.Parse(text);
            if (doc.RootElement.TryGetProperty("sub", out var sub) && sub.ValueKind == JsonValueKind.Object &&
                sub.TryGetProperty("outDate", out var outDate) && outDate.ValueKind == JsonValueKind.String &&
                DateTime.TryParse(outDate.GetString(), out var dt))
            {
                return dt.ToLocalTime().ToString("dd.MM.yyyy");
            }
        }
        catch
        {
        }

        return "0";
    }

    private static string? TryGetMessage(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("message", out var m))
            {
                return m.GetString();
            }
        }
        catch
        {
        }

        return null;
    }
}

public class Profile
{
    public long Id { get; set; }
    public string Username { get; set; } = "";
    public string Email { get; set; } = "";
    public string Role { get; set; } = "USER";
    public string Subscription { get; set; } = "none";
    public string Hwid { get; set; } = "";
    public string RegDate { get; set; } = "";
}
