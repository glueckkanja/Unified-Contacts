using Dapper;
using Dapper.Contrib.Extensions;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.DependencyInjection;
using System.Collections;
using System.Data;
using System.Diagnostics.CodeAnalysis;
using System.Security.Claims;
using UnifiedContacts.Models.DbTables;
using UnifiedContacts.Models.Dto;
using UnifiedContacts.Models.Exceptions;
using UnifiedContacts.Server.Models.Exceptions;
using static System.Net.Mime.MediaTypeNames;

namespace UnifiedContacts
{
    public static class Extensions
    {
        #region ClaimsPrincipal

        private const string UPN_CLAIM_TYPE = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn";
        private const string TENANTID_CLAIM_TYPE = "http://schemas.microsoft.com/identity/claims/tenantid";
        private const string OBJECTID_CLAIM_TYPE = "http://schemas.microsoft.com/identity/claims/objectidentifier";
        private const string PREFERRED_USERNAME_CLAIM_TYPE = "preferred_username";

        /// <summary>
        /// Get the object identifier of the ClaimsPrincipal
        /// </summary>
        /// <returns>Returns object identifier as string.
        /// Returns null if object identifier could not be acquired.</returns>
        /// <exception cref="ArgumentNullException">Returned if ClaimsPrincipal is null</exception>
        public static string? GetObjectId(this ClaimsPrincipal principal)
        {
            if (principal == null)
            {
                throw new ArgumentNullException(nameof(principal));
            }

            try
            {
                return principal.FindFirst(OBJECTID_CLAIM_TYPE)?.Value;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Get the userPrincipalName (preferred_username) of the ClaimsPrincipal
        /// </summary>
        /// <returns>Returns preferred_username of ClaimsPrincipal as string.
        /// Returns object identifier of ClaimsPrincipal as string if preferred_username is not found.
        /// Returns null if neither preferred_username nor object identifier can be found</returns>
        /// <exception cref="ArgumentNullException">Returned if ClaimsPrincipal is null</exception>
        public static string? GetObjectUPN(this ClaimsPrincipal principal)
        {
            if (principal == null)
            {
                throw new ArgumentNullException(nameof(principal));
            }

            string? upn = principal.FindFirst(UPN_CLAIM_TYPE)?.Value;
            if (string.IsNullOrEmpty(upn))
            {
                upn = principal.FindFirst(PREFERRED_USERNAME_CLAIM_TYPE)?.Value;
            }
            if (string.IsNullOrEmpty(upn))
            {
                upn = principal.GetObjectId();
            }
            return upn;
        }

        /// <summary>
        /// Get the domain of the user identity from the ClaimsPrincipal.
        /// max.mustermann@domain.de would return domain.de
        /// </summary>
        /// <returns>Returns domain of the ClaimsPrincipal as string.
        /// Returns null if domain could not be acquired.</returns>
        /// <exception cref="ArgumentNullException">Returned if ClaimsPrincipal is null</exception>
        public static string? GetObjectDomain(this ClaimsPrincipal principal)
        {
            if (principal == null)
            {
                throw new ArgumentNullException(nameof(principal));
            }

            string? upn = principal.GetObjectUPN();
            if (!string.IsNullOrEmpty(upn))
            {
                string[] splittedUPN = upn.Split('@');
                if (splittedUPN.Length > 1)
                {
                    return splittedUPN[1];
                }
            }

            return null;
        }

        /// <summary>
        /// Get the tenantId of the ClaimsPrincipal user
        /// </summary>
        /// <returns>Returns tenantId of the ClaimsPrincipal as string.
        /// Returns null if tenantId cannot be acquired.</returns>
        /// <exception cref="ArgumentNullException">Returned if ClaimsPrincipal is null</exception>
        public static string? GetObjectTenantId(this ClaimsPrincipal principal)
        {
            if (principal == null)
            {
                throw new ArgumentNullException(nameof(principal));
            }

            try
            {
                return principal.FindFirst(TENANTID_CLAIM_TYPE)?.Value;
            }
            catch
            {
                return null;
            }
        }

        #endregion ClaimsPrincipal

        #region IEnumerable

        /// <summary>
        /// Check if IEnumerable is empty or null
        /// </summary>
        /// <typeparam name="T">Type included in IEnumerable</typeparam>
        /// <param name="enumerable">IEnumerable to check</param>
        /// <returns></returns>
        public static bool IsNullOrEmpty<T>([NotNullWhen(false)] this IEnumerable<T>? enumerable)
        {
            return enumerable == null || enumerable.Count() == 0;
        }

        #endregion IEnumerable

        #region SqlConnection

        /// <summary>
        /// Inserts Element into Table, if entry exists the entry is updated
        /// </summary>
        /// <typeparam name="T">DB Model class which needs to use the Table Attribute</typeparam>
        /// <param name="connection">The sql connection dapper usualy operates on</param>
        /// <param name="element">Element that should be Inserted or updated</param>
        /// <returns>Task</returns>
        /// <exception cref="ArgumentException">Is thrown if the Table Attribute or the ExplicitKey Attribute is missing on the class T</exception>
        public static async Task InsertOrUpdate<T>(this SqlConnection connection, T element)
        {
            TableAttribute? tableAttribute = (TableAttribute?)Attribute.GetCustomAttribute(typeof(T), typeof(TableAttribute));
            string? table = tableAttribute?.Name;
            if (string.IsNullOrWhiteSpace(table))
            {
                throw new ArgumentException("Only objects with the Table attribute are supported");
            }
            IEnumerable<System.Reflection.PropertyInfo> explicitKeys = typeof(T).GetProperties().Where(prop => Attribute.IsDefined(prop, typeof(ExplicitKeyAttribute)));
            if (explicitKeys.Count() == 0)
            {
                throw new ArgumentException("Only Tables with ExplicitKey Attribute are supported");
            }

            DynamicParameters sqlParameter = new DynamicParameters();
            int sqlParameterCounter = 1;
            List<string> primaryKeyFilter = new List<string>();

            foreach (System.Reflection.PropertyInfo? explicitKey in explicitKeys)
            {
                string col = explicitKey.Name;
                object? val = explicitKey.GetValue(element);

                string sqlParameterName = $"p{sqlParameterCounter++}";
                primaryKeyFilter.Add($"[{col}] = @{sqlParameterName}");

                sqlParameter.Add(sqlParameterName, val);
            }

            List<string> updateSets = new List<string>();
            List<string> columns = new List<string>();
            List<string> columnParameterNames = new List<string>();

            foreach (System.Reflection.PropertyInfo prop in typeof(T).GetProperties())
            {
                string col = prop.Name;
                object? val = prop.GetValue(element);

                string sqlParameterName = $"p{sqlParameterCounter++}";

                updateSets.Add($"[{col}] = @{sqlParameterName}");
                columns.Add($"[{col}]");
                columnParameterNames.Add($"@{sqlParameterName}");

                sqlParameter.Add(sqlParameterName, val);
            }

            string sql = @$"BEGIN TRANSACTION
UPDATE {table} SET {string.Join(", ", updateSets)} WHERE {string.Join(" AND ", primaryKeyFilter)}
IF @@ROWCOUNT=0
   INSERT INTO {table}({string.Join(", ", columns)}) VALUES({string.Join(", ", columnParameterNames)});
COMMIT";
            if (connection.State == ConnectionState.Closed)
            {
                await connection.OpenAsync();
            }
            await connection.ExecuteAsync(sql, sqlParameter);
        }

        #endregion SqlConnection

        #region Startup

        public static void UseExceptionHandling(this IApplicationBuilder app)
        {
            app.UseExceptionHandler(exceptionHandlerApp =>
            {
                exceptionHandlerApp.Run(async context =>
                {
                    IExceptionHandlerPathFeature? exceptionHandlerPathFeature = context.Features.Get<IExceptionHandlerPathFeature>();
                    if (exceptionHandlerPathFeature != null && exceptionHandlerPathFeature.Error.GetType() == typeof(DatabaseNotConfiguredException))
                    {
                        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
                        context.Response.ContentType = Text.Plain;
                        await context.Response.WriteAsync("Database not configured.");
                        return;
                    }

                    // Any other unhandled exception previously fell through here silently, producing an empty 500 body with no logging.
                    if (exceptionHandlerPathFeature != null)
                    {
                        Microsoft.Extensions.Logging.ILogger logger = context.RequestServices
                            .GetRequiredService<Microsoft.Extensions.Logging.ILoggerFactory>()
                            .CreateLogger("GlobalExceptionHandler");
                        logger.LogError(exceptionHandlerPathFeature.Error, "Unhandled exception on {Path}", exceptionHandlerPathFeature.Path);

                        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
                        context.Response.ContentType = Text.Plain;
                        await context.Response.WriteAsync("An unexpected error occurred. Please check the application logs.");
                    }
                });
            });
        }

        #endregion Startup

        #region HttpRequest

        public static async Task<string> ReadAsString(this HttpRequest request)
        {
            using (StreamReader sr = new StreamReader(request.Body))
            {
                return await sr.ReadToEndAsync();
            }
        }

        #endregion HttpRequest

        #region Object

        public static void TrimAllStringValues(this object? obj, bool ignorePropertyExceptions = false)
        {
            if (obj == null)
            {
                return;
            }

            if (typeof(IEnumerable).IsAssignableFrom(obj.GetType()))
            {
                foreach (object? item in (IEnumerable)obj)
                {
                    TrimAllStringValues(item, ignorePropertyExceptions);
                }
                return;
            }

            System.Reflection.PropertyInfo[] propertiesOfObject = obj.GetType().GetProperties();
            foreach (System.Reflection.PropertyInfo property in propertiesOfObject)
            {
                try
                {
                    if (property.CanRead)
                    {
                        if (property.PropertyType == typeof(string))
                        {
                            string? currentValue = (string?)property.GetValue(obj);
                            if (!string.IsNullOrEmpty(currentValue) && property.CanWrite)
                            {
                                property.SetValue(obj, currentValue.Trim());
                            }
                        }
                        else if (property.PropertyType.GetInterfaces().Contains(typeof(IEnumerable<string>)))
                        {
                            IEnumerable<string>? currentValue = (IEnumerable<string>?)property.GetValue(obj);
                            if (!currentValue.IsNullOrEmpty() && property.CanWrite)
                            {
                                property.SetValue(obj, currentValue.ToList().ConvertAll(s => s?.Trim()));
                            }
                        }
                        else if (typeof(IEnumerable).IsAssignableFrom(property.PropertyType))
                        {
                            foreach (object? subObj in (IEnumerable)property.GetValue(obj)!)
                            {
                                TrimAllStringValues(subObj, ignorePropertyExceptions);
                            }
                        }
                        else if (property.PropertyType.IsSubclassOf(typeof(object)))
                        {
                            TrimAllStringValues(property.GetValue(obj), ignorePropertyExceptions);
                        }
                    }
                }
                catch (Exception)
                {
                    if (!ignorePropertyExceptions)
                    {
                        throw;
                    }
                    continue;
                }
            }
        }

        #endregion Object

        #region Tasks

        /// <summary>
        /// Observes the task to avoid the UnobservedTaskException event to be raised.
        /// </summary>
        public static void Forget(this Task task)
        {
            // note: this code is inspired by a tweet from Ben Adams: https://twitter.com/ben_a_adams/status/1045060828700037125
            // Only care about tasks that may fault (not completed) or are faulted,
            // so fast-path for SuccessfullyCompleted and Canceled tasks.
            if (!task.IsCompleted || task.IsFaulted)
            {
                // use "_" (Discard operation) to remove the warning IDE0058: Because this call is not awaited, execution of the current method continues before the call is completed
                // https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/functional/discards?WT.mc_id=DT-MVP-5003978#a-standalone-discard
                _ = ForgetAwaited(task);
            }

            // Allocate the async/await state machine only when needed for performance reasons.
            // More info about the state machine: https://blogs.msdn.microsoft.com/seteplia/2017/11/30/dissecting-the-async-methods-in-c/?WT.mc_id=DT-MVP-5003978
            async static Task ForgetAwaited(Task task)
            {
                try
                {
                    // No need to resume on the original SynchronizationContext, so use ConfigureAwait(false)
                    await task.ConfigureAwait(false);
                }
                catch
                {
                    // Nothing to do here
                }
            }
        }

        #endregion Tasks

        #region Converters / Adapters

        public static RuntimeInfoSBCLookup ConvertToRuntimeInfoSBCLookup(this IEnumerable<AdminSettingsDB> settingsFromDb)
        {
            return new RuntimeInfoSBCLookup()
            {
                EndpointEnabled = settingsFromDb.Where(setting => setting.Key == UnifiedContactStaticStrings.SETTINGS_SBC_LOOKUP_ENDPOINT_ENABLED_SETTING_ID).FirstOrDefault()?.Value == "1",
                AnyNodeEndpointEnabled = settingsFromDb.Where(setting => setting.Key == UnifiedContactStaticStrings.SETTINGS_SBC_LOOKUP_ANY_NODE_ENDPOINT_ENABLED_SETTING_ID).FirstOrDefault()?.Value == "1",
                HashedAuthenticationCredential = settingsFromDb.Where(setting => setting.Key == UnifiedContactStaticStrings.SETTINGS_SBC_LOOKUP_CREDENTIALS_SETTING_ID).FirstOrDefault()?.Value,
                IsIpAuthenticationEnabled = settingsFromDb.Where(setting => setting.Key == UnifiedContactStaticStrings.SETTINGS_SBC_LOOKUP_IP_AUTHENTICATION_ENABLED_SETTING_ID).FirstOrDefault()?.Value == "1",
                AllowedIpAddresses = settingsFromDb.Where(setting => setting.Key == UnifiedContactStaticStrings.SETTINGS_SBC_LOOKUP_ALLOWED_IP_ADDRESSES_SETTING_ID).FirstOrDefault()?.Value?.Split(';').ToHashSet(),
            };
        }

        #endregion Converters / Adapters

        #region HttpResponse

        public static void EnsureSuccessStatusCodeWithResponseInfo(this HttpResponseMessage response)
        {
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpResponseException(response);
            }
        }

        #endregion HttpResponse
    }
}