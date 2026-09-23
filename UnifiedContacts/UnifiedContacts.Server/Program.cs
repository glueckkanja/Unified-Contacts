using Azure.Identity;
using Azure.Storage.Blobs;
using DbUp;
using DbUp.Engine;
using DbUp.Support;
using Microsoft.ApplicationInsights;
using Microsoft.ApplicationInsights.AspNetCore.Extensions;
using Microsoft.ApplicationInsights.Extensibility;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Primitives;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Net.Http.Headers;
using Microsoft.OpenApi;
using System.IdentityModel.Tokens.Jwt;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using UnifiedContacts;
using UnifiedContacts.Engines;
using UnifiedContacts.Engines.SearchEngines;
using UnifiedContacts.Interfaces;
using UnifiedContacts.Models.Dto;
using UnifiedContacts.Models.Exceptions;
using UnifiedContacts.Repositories;
using UnifiedContacts.Settings;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

RuntimeInfoDto runtimeInfo = new RuntimeInfoDto();

if (builder.Environment.IsProduction())
{
    try
    {
        builder.Configuration.AddAzureKeyVault(
            new Uri($"https://{builder.Configuration["KeyVaultName"]}.vault.azure.net/"),
            new DefaultAzureCredential());
        runtimeInfo.KeyVaultConfigured = true;
    }
    catch (Exception e)
    {
        runtimeInfo.KeyVaultConfigured = false;
        runtimeInfo.KeyVaultErrorMessage = e.Message;
    }
}
else
{
    runtimeInfo.KeyVaultConfigured = true;
}

// Service setup
// Load settings
AuthSettings authSettings = new AuthSettings();
builder.Configuration.Bind("AuthSettings", authSettings);
AppSettings appSettings = new AppSettings();
builder.Configuration.GetSection("AppSettings").Bind(appSettings);
AppServiceSettings appServiceSettings = new AppServiceSettings();
builder.Configuration.Bind(appServiceSettings);

if (!string.IsNullOrWhiteSpace(authSettings.DatabaseConnectionString))
{
    using (SqlConnection connection = new SqlConnection(authSettings.DatabaseConnectionString))
    {
        try
        {
            connection.Open();
            connection.Close();
            runtimeInfo.DatabaseConfigured = true;
        }
        catch (Exception e)
        {
            runtimeInfo.DatabaseConfigured = false;
            runtimeInfo.DatabaseErrorMessage = e.Message;
        }
    }
}
else
{
    runtimeInfo.DatabaseConfigured = false;
}

//DbUp integration
if (runtimeInfo.DatabaseConfigured)
{
    UpgradeEngine upgrader = DeployChanges.To
        .SqlDatabase(authSettings.DatabaseConnectionString)
        .WithScriptsEmbeddedInAssembly(Assembly.GetExecutingAssembly(), script => script.StartsWith("UnifiedContacts.Server.DatabaseScripts.RunFirst."), new SqlScriptOptions { ScriptType = ScriptType.RunOnce, RunGroupOrder = 1 })
        .WithScriptsEmbeddedInAssembly(Assembly.GetExecutingAssembly(), script => script.StartsWith("UnifiedContacts.Server.DatabaseScripts.Versions._1._3._0."), new SqlScriptOptions { ScriptType = ScriptType.RunOnce, RunGroupOrder = 2 })
        .WithScriptsEmbeddedInAssembly(Assembly.GetExecutingAssembly(), script => script.StartsWith("UnifiedContacts.Server.DatabaseScripts.Versions._1._4._0."), new SqlScriptOptions { ScriptType = ScriptType.RunOnce, RunGroupOrder = 3 })
        .WithScriptsEmbeddedInAssembly(Assembly.GetExecutingAssembly(), script => script.StartsWith("UnifiedContacts.Server.DatabaseScripts.Versions._1._5._0."), new SqlScriptOptions { ScriptType = ScriptType.RunOnce, RunGroupOrder = 4 })
        .WithScriptsEmbeddedInAssembly(Assembly.GetExecutingAssembly(), script => script.StartsWith("UnifiedContacts.Server.DatabaseScripts.Versions._1._5._2."), new SqlScriptOptions { ScriptType = ScriptType.RunOnce, RunGroupOrder = 5 })
        .WithScriptsEmbeddedInAssembly(Assembly.GetExecutingAssembly(), script => script.StartsWith("UnifiedContacts.Server.DatabaseScripts.Versions._5._3._0."), new SqlScriptOptions { ScriptType = ScriptType.RunOnce, RunGroupOrder = 6 })
        .WithScriptsEmbeddedInAssembly(Assembly.GetExecutingAssembly(), script => script.StartsWith("UnifiedContacts.Server.DatabaseScripts.Versions._5._6._0."), new SqlScriptOptions { ScriptType = ScriptType.RunOnce, RunGroupOrder = 7 })
        .WithScriptsEmbeddedInAssembly(Assembly.GetExecutingAssembly(), script => script.StartsWith("UnifiedContacts.Server.DatabaseScripts.Versions._5._7._0."), new SqlScriptOptions { ScriptType = ScriptType.RunOnce, RunGroupOrder = 8 })
        .Build();

    if (upgrader.IsUpgradeRequired())
    {
        try
        {
            DatabaseUpgradeResult dbResult = upgrader.PerformUpgrade();
            runtimeInfo.DbUpSuccessfull = dbResult.Successful;
            if (!dbResult.Successful)
            {
                runtimeInfo.DbUpErrorMessage = dbResult.Error.Message;
            }
        }
        catch (Exception e)
        {
            runtimeInfo.DbUpSuccessfull = false;
            runtimeInfo.DbUpErrorMessage = e.Message;
        }
    }
    else
    {
        runtimeInfo.DbUpSuccessfull = true;
    }
}

// Authentication
builder.Services.AddAuthentication(auth =>
{
    auth.DefaultScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer("teams", options =>
{
    options.IncludeErrorDetails = false;
    options.Authority = $"https://login.microsoftonline.com/*";
    options.TokenValidationParameters = new Microsoft.IdentityModel.Tokens.TokenValidationParameters()
    {
        ValidateIssuer = false,
        ValidateAudience = true,
        ValidAudience = authSettings.ClientId,
    };

    options.Events = new JwtBearerEvents()
    {
        OnTokenValidated = (context) =>
        {
            if (!context.SecurityToken.Issuer.StartsWith("https://login.microsoftonline.com/")) // As we are expecting a v2 Token the issuer must follow: https://login.microsoftonline.com/<tentantId>/v2.0
            {
                throw new SecurityTokenValidationException($"Issuer {context.SecurityToken.Issuer} is not valid");
            }

            return Task.CompletedTask;
        },

        OnAuthenticationFailed = (context) =>
        {
            context.Response.StatusCode = 401; //Necessery because otherwise 500 would be thrown in case of LifetimeValidation
            return Task.CompletedTask;
        }
    };
})
.AddJwtBearer("adminPage", options =>
{
    options.IncludeErrorDetails = false;
    options.Authority = $"https://login.microsoftonline.com/*";
    options.TokenValidationParameters = new Microsoft.IdentityModel.Tokens.TokenValidationParameters()
    {
        ValidateAudience = true,
        ValidAudience = $"api://{authSettings.AdminPageClientId}",
        ValidIssuer = $"https://sts.windows.net/{authSettings.AdminPageTenantId}/"
    };

    options.Events = new JwtBearerEvents()
    {
        OnTokenValidated = (context) =>
        {
            return Task.CompletedTask;
        },

        OnAuthenticationFailed = (context) =>
        {
            context.Response.StatusCode = 401; //Necessery because otherwise 500 would be thrown in case of LifetimeValidation
            return Task.CompletedTask;
        }
    };
}).AddPolicyScheme(
    JwtBearerDefaults.AuthenticationScheme,
    "Selector",
    options =>
    {
        options.ForwardDefaultSelector = context =>
        {
            if (string.IsNullOrWhiteSpace(authSettings.AdminPageClientId) || string.IsNullOrWhiteSpace(authSettings.AdminPageTenantId) || string.IsNullOrWhiteSpace(authSettings.AdminPageClientSecret))
            {
                return "teams";
            }
            // Find the first authentication header with a JWT Bearer token whose issuer
            // contains one of the scheme names and return the found scheme name.
            string[] authHeaderNames = new[] {
                HeaderNames.Authorization,
                HeaderNames.WWWAuthenticate
            };
            StringValues headers = new StringValues();
            foreach (string? headerName in authHeaderNames)
            {
                if (context.Request.Headers.TryGetValue(headerName, out headers) && !StringValues.IsNullOrEmpty(headers))
                {
                    break;
                }
            }

            if (StringValues.IsNullOrEmpty(headers))
            {
                //Default to teams scheme
                return "teams";
            }

            foreach (string? header in headers)
            {
                if (!header.StartsWith(JwtBearerDefaults.AuthenticationScheme))
                {
                    continue;
                }
                string encodedToken = header.Substring(JwtBearerDefaults.AuthenticationScheme.Length + 1);
                JwtSecurityTokenHandler jwtHandler = new JwtSecurityTokenHandler();
                JwtSecurityToken decodedToken = jwtHandler.ReadJwtToken(encodedToken);
                IEnumerable<string>? audiences = decodedToken?.Audiences;
                if (UnifiedContacts.Extensions.IsNullOrEmpty(audiences))
                {
                    //Default to teams scheme
                    return "teams";
                }
                else
                {
                    string audience = audiences!.First().ToLower();
                    if (audience == $"api://{authSettings.AdminPageClientId!.ToLower()}")
                    {
                        return "adminPage";
                    }
                    else if (audience == authSettings.ClientId!.ToLower())
                    {
                        return "teams";
                    }
                }
            }
            //Default to main scheme
            return "teams";
        };
    });

builder.Services.AddAuthorization(options =>
{
    // Make sure AdminPage endpoints are authenticated thorugh AdminPage AppReg
    options.AddPolicy("AdminPage", policy =>
    {
        policy.RequireAssertion(
            context =>
            {
                return authSettings.AdminPageClientId != null && context.User.HasClaim(claim => claim.Type == "aud" && claim.Value == $"api://{authSettings.AdminPageClientId}");
            }
        );
    });

    options.AddPolicy("CustomerApi", policy =>
    {
        policy.RequireAssertion(
            context =>
            {
                return authSettings.AdminPageClientId != null && context.User.HasClaim(claim => claim.Type == "aud" && claim.Value == $"api://{authSettings.AdminPageClientId}");
            }
        );
    });

    // Make sure TeamsApp endpoints are authenticated thorugh TeamsApp AppReg
    options.AddPolicy("TeamsApp", policy =>
    {
        policy.RequireAssertion(
            context =>
            {
                return context.User.HasClaim(claim => claim.Type == "aud" && claim.Value == authSettings.ClientId);
            }
        );
    });
});

// Allow all cors in development
#if DEBUG
builder.Services.AddCors(options =>
{
    options.AddPolicy(name: "AllowAllOrigin",
                      policy =>
                      {
                          policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
                      });
});

#endif

// Add services to the container.

// Setup Dependency injections
BlobServiceDto blobServiceClientDto = new BlobServiceDto();
if (!string.IsNullOrWhiteSpace(appSettings.BlobStorageUrl))
{
    try
    {
        BlobServiceClient blobServiceClient = new BlobServiceClient(
            new Uri($"https://{appSettings.BlobStorageUrl}"),
            new DefaultAzureCredential());
        blobServiceClientDto.Client = blobServiceClient;
    }
    catch (Exception)
    {
        //Fall through
    }
}

builder.Services.AddSingleton(blobServiceClientDto);
builder.Services.AddSingleton(appSettings);
builder.Services.AddSingleton(runtimeInfo);
builder.Services.AddSingleton(authSettings);
builder.Services.AddSingleton(appServiceSettings);
builder.Services.AddSingleton<UpdateStatusDto>();

//Engines
builder.Services.AddTransient<SBCLookupEngine>();
builder.Services.AddSingleton<IGraphApiEngine, GraphApiEngine>();
builder.Services.AddSingleton<TelemetryEngine>();
builder.Services.AddSingleton<ContactManagementEngine>();
builder.Services.AddTransient<AdminControllerEngine>();

// Search Engines
builder.Services.AddSingleton<SearchEngineFactory>();
builder.Services.AddSingleton<AzureADSearchEngine>();
builder.Services.AddSingleton<UserContactsSearchEngine>();
builder.Services.AddSingleton<OrgContactsSearchEngine>();
builder.Services.AddSingleton<SharePointSearchEngine>();
builder.Services.AddSingleton<DatabaseSearchEngine>();

CacheRepository cacheRepository = new CacheRepository(authSettings, runtimeInfo);
try
{
    cacheRepository.SetValue("lastServerStartTimestamp", DateTime.UtcNow.ToString("O")).Forget();
}
catch (DatabaseNotConfiguredException)
{
    /* Fall through */
}
builder.Services.AddSingleton<CacheRepository>(cacheRepository);
builder.Services.AddSingleton<SettingsRepository>();
builder.Services.AddSingleton<UsageRepository>();
builder.Services.AddSingleton<FavoritesRepository>();
builder.Services.AddSingleton<DatabaseContactsRepository>();
builder.Services.AddTransient<TelemetryRepository>();

string? aiConnectionString = builder.Configuration.GetConnectionString("ApplicationInsights");
if (!string.IsNullOrWhiteSpace(aiConnectionString))
{
    ApplicationInsightsServiceOptions aiOptions = new ApplicationInsightsServiceOptions();
    aiOptions.ConnectionString = aiConnectionString;
    builder.Services.AddApplicationInsightsTelemetry(aiOptions); // This already injects the TelemetryClient
}
else
{
    // v3's OpenTelemetry-based exporter throws at startup without a connection string; register a disabled client instead so DI still resolves
    builder.Services.AddSingleton(new TelemetryClient(new TelemetryConfiguration { DisableTelemetry = true }));
}
builder.Services.AddHttpClient("default");

builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    options.JsonSerializerOptions.NumberHandling = JsonNumberHandling.AllowReadingFromString;
}); ;
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Version = "v1",
        Title = "UnifiedContacts API",
        Description = "An ASP.NET Core Web API for searching contacts"
    });
    
    string xmlFilename = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
    options.IncludeXmlComments(Path.Combine(AppContext.BaseDirectory, xmlFilename));
});

WebApplication app = builder.Build();

app.UseExceptionHandling();

app.UseDefaultFiles();
app.UseStaticFiles();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "UnifiedContacts API Docs");
        options.RoutePrefix = "api";
    });
    app.UseCors("AllowAllOrigin");
}


if (runtimeInfo.DatabaseConfigured)
{
    SettingsRepository? settingsRepository = app.Services.GetService<SettingsRepository>();
    if (settingsRepository != null)
    {
        await settingsRepository.UpdateRuntimeInfo();
    }
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapFallbackToFile("/index.html");

app.Run();