using System;
using System.Collections.Generic;
using System.Net.Http;
using BlazorApp.Models;
using Blazored.LocalStorage;
using Microsoft.AspNetCore.Components.Authorization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json.Nodes;
using System.Threading.Tasks;

namespace BlazorApp.Services
{
    public class CustomAuthStateProvider : AuthenticationStateProvider
    {
        private readonly HttpClient httpClient;
        private readonly ISyncLocalStorageService localStorage;
        public ConnectionDiagnostics LastDiagnostics { get; set; } = new();

        public CustomAuthStateProvider(
            HttpClient httpClient,
            ISyncLocalStorageService localStorage)
        {
            this.httpClient = httpClient;
            this.localStorage = localStorage;

            var accessToken = localStorage.GetItem<string>("accessToken");
            if (accessToken != null)
            {
                this.httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
                LastDiagnostics.HasAuthToken = true;
            }
        }

        public override async Task<AuthenticationState> GetAuthenticationStateAsync()
        {
            /*
            //var user = new ClaimsPrincipal(new ClaimsIdentity()); // non-authenticated user

            var claims = new List<Claim> { new Claim(ClaimTypes.Name, "John") };
            var identity = new ClaimsIdentity(claims, "ANY");
            var user = new ClaimsPrincipal(identity);

            return Task.FromResult(new AuthenticationState(user));
            */

            var user = new ClaimsPrincipal(new ClaimsIdentity()); // non-authenticated user

            try
            {
                var response = await httpClient.GetAsync("api/Account/Profile");
                if (response.IsSuccessStatusCode)
                {
                    /*
                    var strResponse = await response.Content.ReadAsStringAsync();
                    var jsonResponse = JsonNode.Parse(strResponse);
                    var email = jsonResponse!["email"]!.ToString();

                    var claims = new List<Claim>
                    {
                        new(ClaimTypes.Name, email),
                        new(ClaimTypes.Email, email),
                    };
                    */


                    var userProfile = await response.Content.ReadFromJsonAsync<UserProfile>();
                    if (userProfile == null) throw new Exception();

                    var userRoles = userProfile.Role.Split(",");

                    var claims = new List<Claim>
                    {
                        new(ClaimTypes.Name, userProfile.FirstName + " " + userProfile.LastName),
                        new(ClaimTypes.Email, userProfile.Email),
                    };

                    foreach (var role in userRoles)
                    {
                        claims.Add(new Claim(ClaimTypes.Role, role));
                    }

                    // set the principal
                    var identity = new ClaimsIdentity(claims, "Token");
                    user = new ClaimsPrincipal(identity);
                    return new AuthenticationState(user);
                }
            }
            catch (Exception ex)
            {
            }

            return new AuthenticationState(user);
        }


        public async Task<FormResult> LoginAsync(string email, string password)
        {
            // Initialize diagnostics
            LastDiagnostics = new ConnectionDiagnostics
            {
                Timestamp = DateTime.Now,
                CurrentPage = httpClient.BaseAddress?.ToString() ?? "unknown",
                ContentProviderApiUrl = httpClient.BaseAddress?.ToString() ?? "unknown",
                HasAuthToken = !string.IsNullOrEmpty(localStorage.GetItem<string>("accessToken"))
            };

            var baseUrl = httpClient.BaseAddress?.ToString() ?? "unknown";
            // Normalize base URL - remove trailing slash to avoid double slashes
            if (baseUrl.EndsWith("/"))
            {
                baseUrl = baseUrl.TrimEnd('/');
            }
            
            var diagnostic = new RequestDiagnostic
            {
                Name = "login",
                Method = "POST",
                BaseUrl = baseUrl,
                Path = "/login",
                StartedAt = DateTime.Now
            };
            diagnostic.Url = $"{diagnostic.BaseUrl}{diagnostic.Path}";

            try
            {
                var response = await httpClient.PostAsJsonAsync("login", new { email, password });
                diagnostic.EndedAt = DateTime.Now;
                diagnostic.DurationMs = (long)(diagnostic.EndedAt - diagnostic.StartedAt).TotalMilliseconds;
                diagnostic.HttpStatusCode = (int)response.StatusCode;
                diagnostic.HttpStatusCodeText = response.ReasonPhrase;
                diagnostic.ReachedServer = true;

                if (response.IsSuccessStatusCode)
                {
                    var strResponse = await response.Content.ReadAsStringAsync();
                    diagnostic.ResponseBody = strResponse.Length > 200 ? strResponse.Substring(0, 200) + "..." : strResponse;

                    var jsonResponse = JsonNode.Parse(strResponse);
                    var accessToken = jsonResponse?["accessToken"]?.ToString();
                    var refreshToken = jsonResponse?["refreshToken"]?.ToString();

                    localStorage.SetItem("accessToken", accessToken);
                    localStorage.SetItem("refreshToken", refreshToken);

                    httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

                    // need to refresh auth state
                    NotifyAuthenticationStateChanged(GetAuthenticationStateAsync());

                    // success!
                    LastDiagnostics.Requests.Add(diagnostic);
                    return new FormResult { Succeeded = true };
                }
                else if (response.StatusCode == System.Net.HttpStatusCode.BadRequest)
                {
                    diagnostic.LikelyCause = "HTTP 400 Bad Request - invalid credentials or validation error";
                    LastDiagnostics.Requests.Add(diagnostic);
                    return new FormResult { Succeeded = false, Errors = ["Bad Email or Password"] };
                }
                else if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                {
                    diagnostic.LikelyCause = "HTTP 401 Unauthorized - authentication required or invalid credentials";
                    LastDiagnostics.Requests.Add(diagnostic);
                    return new FormResult { Succeeded = false, Errors = ["Unauthorized - check credentials"] };
                }
                else
                {
                    diagnostic.LikelyCause = $"HTTP {(int)response.StatusCode} {response.ReasonPhrase}";
                    LastDiagnostics.Requests.Add(diagnostic);
                    return new FormResult { Succeeded = false, Errors = [$"HTTP Error: {(int)response.StatusCode}"] };
                }
            }
            catch (HttpRequestException hre)
            {
                diagnostic.EndedAt = DateTime.Now;
                diagnostic.DurationMs = (long)(diagnostic.EndedAt - diagnostic.StartedAt).TotalMilliseconds;
                diagnostic.ErrorType = "HttpRequestException";
                diagnostic.ErrorMessage = hre.Message;
                diagnostic.InnerException = hre.InnerException?.Message;
                diagnostic.LikelyCause = "API offline or port closed - connection refused";
                LastDiagnostics.Requests.Add(diagnostic);
            }
            catch (TaskCanceledException tce)
            {
                diagnostic.EndedAt = DateTime.Now;
                diagnostic.DurationMs = (long)(diagnostic.EndedAt - diagnostic.StartedAt).TotalMilliseconds;
                diagnostic.ErrorType = "TaskCanceledException";
                diagnostic.ErrorMessage = tce.Message;
                diagnostic.InnerException = tce.InnerException?.Message;
                diagnostic.LikelyCause = "Request timeout - API not responding";
                LastDiagnostics.Requests.Add(diagnostic);
            }
            catch (Exception ex)
            {
                diagnostic.EndedAt = DateTime.Now;
                diagnostic.DurationMs = (long)(diagnostic.EndedAt - diagnostic.StartedAt).TotalMilliseconds;
                diagnostic.ErrorType = ex.GetType().Name;
                diagnostic.ErrorMessage = ex.Message;
                diagnostic.InnerException = ex.InnerException?.Message;
                diagnostic.LikelyCause = "Unknown error - check browser console";
                LastDiagnostics.Requests.Add(diagnostic);
            }

            return new FormResult { Succeeded = false, Errors = ["Connection Error"] };
        }


        public void Logout()
        {
            // delete tokens from localstorage
            localStorage.RemoveItem("accessToken");
            localStorage.RemoveItem("refreshToken");
            httpClient.DefaultRequestHeaders.Authorization = null;
            NotifyAuthenticationStateChanged(GetAuthenticationStateAsync());
        }



        public async Task<FormResult> RegisterAsync(RegisterDto registerDto)
        {
            try
            {
                var response = await httpClient.PostAsJsonAsync("signup", registerDto);
                if (response.IsSuccessStatusCode)
                {
                    //return new FormResult { Succeeded = true };
                    var loginResponse = await LoginAsync(registerDto.Email, registerDto.Password);
                    return loginResponse;
                }


                // register errors
                var strResponse = await response.Content.ReadAsStringAsync();
                Console.WriteLine(strResponse);
                var jsonResponse = JsonNode.Parse(strResponse);
                var errorsObject = jsonResponse!["errors"]!.AsObject();
                var errorsList = new List<string>();
                foreach (var error in errorsObject)
                {
                    errorsList.Add(error.Value![0]!.ToString());
                }


                var formResult = new FormResult
                {
                    Succeeded = false,
                    Errors = errorsList.ToArray()
                };

                return formResult;
            }
            catch (Exception ex)
            {
            }

            return new FormResult { Succeeded = false, Errors = ["Connection Error"] };
        }
    }


    public class FormResult
    {
        public bool Succeeded { get; set; }

        public string[] Errors { get; set; } = [];
    }
}
