using AdminPortal.Helper;
using Azure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Graph.Models;
using Microsoft.Kiota.Abstractions;
using Microsoft.Kiota.Abstractions.Serialization;
using Microsoft.Net.Http.Headers;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using UnifiedContacts.Engines;
using UnifiedContacts.Interfaces;
using UnifiedContacts.Models.Dto;
using UnifiedContacts.Models.Payloads;
using UnifiedContacts.Models.Responses;
using UnifiedContacts.Models.Responses.Admin;
using UnifiedContacts.Repositories;
using UnifiedContacts.Server.Models.Exceptions;
using UnifiedContacts.Server.Models.Exceptions.EntraIdFilter;
using UnifiedContacts.Server.Models.Payloads;
using UnifiedContacts.Settings;

namespace UnifiedContacts.Controllers
{
    [Authorize(Policy = "AdminPage")]
    [Route("v1.3.0/api/[controller]")]
    [ApiController]
    public class AdminController : ControllerBase
    {
        private readonly IGraphApiEngine _graphApiEngine;
        private readonly AuthSettings _authSettings;
        private readonly RuntimeInfoDto _runtimeInfoDto;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly SettingsRepository _settingsRepository;
        private readonly BlobServiceDto _blobServiceDto;
        private readonly UpdateStatusDto _updateStatusDto;
        private readonly AppServiceSettings _appServiceSettings;
        private readonly SBCLookupEngine _sbcLookupEngine;
        private readonly AdminControllerEngine _adminControllerEngine;

        public AdminController(IGraphApiEngine graphApiEngine, AuthSettings authSettings, RuntimeInfoDto runtimeInfoDto, IHttpClientFactory httpClientFactory, SettingsRepository settingsRepository, BlobServiceDto blobService, UpdateStatusDto updateStatusDto, AppServiceSettings appServiceSettings, SBCLookupEngine sbcLookupEngine, AdminControllerEngine adminControllerEngine)
        {
            _graphApiEngine = graphApiEngine;
            _authSettings = authSettings;
            _runtimeInfoDto = runtimeInfoDto;
            _httpClientFactory = httpClientFactory;
            _settingsRepository = settingsRepository;
            _blobServiceDto = blobService;
            _updateStatusDto = updateStatusDto;
            _appServiceSettings = appServiceSettings;
            _sbcLookupEngine = sbcLookupEngine;
            _adminControllerEngine = adminControllerEngine;
        }

        #region Get dependency Status

        private async Task<GetDependenciesStatusDependency> GetTeamsAppRegStatus()
        {
            try
            {
                if (string.IsNullOrWhiteSpace(_authSettings.ClientId))
                {
                    new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_TEAMS_APP_REGISTRATION, DependencyStatus.ERROR, "The Teams App is not cofigured in the backend");
                }

                string delegatedToken = Request.Headers[HeaderNames.Authorization].ToString().Replace("Bearer", string.Empty).Replace(" ", string.Empty);

                Microsoft.Graph.GraphServiceClient graphClient = _graphApiEngine.AuthorizeWithOnBehalfOfTokenAdminPage(delegatedToken);

                ServicePrincipal? ucTeamsServicePrincipal = (await graphClient.ServicePrincipals.GetAsync((requestConfiguration) =>
                {
                    requestConfiguration.QueryParameters.Filter = $"appId eq '{_authSettings.ClientId}'";
                    requestConfiguration.QueryParameters.Select = new string[] { "Id" };
                }))?.Value?.FirstOrDefault();
                if (ucTeamsServicePrincipal == null)
                {
                    return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_TEAMS_APP_REGISTRATION, DependencyStatus.ERROR, "The Teams App Registration was not found");
                }
                OAuth2PermissionGrant? oauth2PermissionGrant = (await graphClient.ServicePrincipals[ucTeamsServicePrincipal?.Id].Oauth2PermissionGrants.GetAsync((requestConfiguration) =>
                {
                    requestConfiguration.QueryParameters.Filter = "consentType eq 'AllPrincipals'";
                    requestConfiguration.QueryParameters.Select = new string[] { "scope", "consentType" };
                    requestConfiguration.Headers.Add("ConsistencyLevel", "eventual");
                    requestConfiguration.QueryParameters.Count = true;
                }))?.Value!.FirstOrDefault();
                if (oauth2PermissionGrant == null || oauth2PermissionGrant.Scope == null)
                {
                    return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_TEAMS_APP_REGISTRATION, DependencyStatus.WARNING, "Admin constent not granted");
                }
                string[] grantedScopes = oauth2PermissionGrant.Scope.Split(" ");
                IEnumerable<string> missingGrants = StaticSettings.NECESSARY_PERMISSIONS_PRO.Except(grantedScopes);
                if (!missingGrants.IsNullOrEmpty())
                {
                    if (missingGrants.Count() == StaticSettings.NECESSARY_PERMISSIONS_PRO.Count)
                    {
                        // No Permission is granted yet
                        return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_TEAMS_APP_REGISTRATION, DependencyStatus.WARNING, "Admin constent not granted");
                    }
                    else
                    {
                        return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_TEAMS_APP_REGISTRATION, DependencyStatus.WARNING, $"Some necessary permissions are not Admin Granted ({string.Join(", ", missingGrants)})");
                    }
                }

                return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_TEAMS_APP_REGISTRATION, DependencyStatus.HEALTHY);
            }
            catch (ApiException e)
            {
                return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_TEAMS_APP_REGISTRATION, DependencyStatus.UNKNOWN, (e.ResponseStatusCode.ToString())); //TODO check if only integer is shown
            }
            catch (Exception)
            {
                return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_TEAMS_APP_REGISTRATION, DependencyStatus.UNKNOWN);
            }
        }

        private GetDependenciesStatusDependency GetKeyVaultStatus()
        {
            if (_runtimeInfoDto.KeyVaultConfigured)
            {
                List<string> unsetProperties = new List<string>();

                foreach (System.Reflection.PropertyInfo prop in _authSettings.GetType().GetProperties())
                {
                    if (prop.GetValue(_authSettings) == null)
                    {
                        unsetProperties.Add(prop.Name);
                    }
                }

                if (unsetProperties.IsNullOrEmpty())
                {
                    return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_KEY_VAULT, DependencyStatus.HEALTHY, "Connection successfull");
                }
                else
                {
                    return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_KEY_VAULT, DependencyStatus.WARNING, $"Missing KeyVault Secrets ({string.Join(", ", unsetProperties)})");
                }
            }
            else
            {
                return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_KEY_VAULT, DependencyStatus.ERROR, _runtimeInfoDto.KeyVaultErrorMessage);
            }
        }

        private GetDependenciesStatusDependency GetDatabaseStatus()
        {
            if (string.IsNullOrWhiteSpace(_authSettings.DatabaseConnectionString))
            {
                return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_DATABASE, DependencyStatus.ERROR, "ConnectionString not set up");
            }

            if (_runtimeInfoDto.DatabaseConfigured && _runtimeInfoDto.DbUpSuccessfull)
            {
                return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_DATABASE, DependencyStatus.HEALTHY, "Connection successfull");
            }

            // Database Configured errors "win" over DbUp errors, as DbUp errors might be caused by the database not being configured propertly
            if (!_runtimeInfoDto.DatabaseConfigured)
            {
                return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_DATABASE, DependencyStatus.ERROR, _runtimeInfoDto.DatabaseErrorMessage ?? "Error while communication with Database");
            }
            else //if !_ runtimeInfoDtoDto.DbUpSuccessfull
            {
                return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_DATABASE, DependencyStatus.ERROR, $"Error while updating Database: {_runtimeInfoDto.DbUpErrorMessage}");
            }
        }

        private async Task<GetDependenciesStatusDependency> GetStorageAccountStatus()
        {
            if (_blobServiceDto.Client == null)
            {
                return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_STORAGE_ACCOUNT, DependencyStatus.ERROR, "Could not connect to Storage account");
            }

            try
            {
                Azure.Storage.Blobs.BlobContainerClient blobContainerClient = _blobServiceDto.Client.GetBlobContainerClient(StaticSettings.BLOB_STORAGE_CONTAINER_NAME);
                Response<bool> containerExists = await blobContainerClient.ExistsAsync();
                if (!containerExists)
                {
                    return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_STORAGE_ACCOUNT, DependencyStatus.ERROR, "Container not found");
                }

                Azure.Storage.Blobs.BlobClient blobClient = _blobServiceDto.Client.GetBlobContainerClient(StaticSettings.BLOB_STORAGE_CONTAINER_NAME).GetBlobClient("thisDoesNotExistButTestsTheWritePermissions");
                await blobClient.DeleteIfExistsAsync();

                return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_STORAGE_ACCOUNT, DependencyStatus.HEALTHY, "Connection successfull");
            }
            catch (Exception)
            {
                return new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_STORAGE_ACCOUNT, DependencyStatus.ERROR, "Connection Failed");
            }
        }

        [HttpGet("dependencies/status")]
        public async Task<ActionResult<GetDependenciesStatusResponse>> GetDependenciesStatus()
        {
            GetDependenciesStatusResponse responseObject = new GetDependenciesStatusResponse();
            responseObject.Dependencies.Add(new GetDependenciesStatusDependency(UnifiedContactStaticStrings.HEALTH_STATE_DISPLAY_NAME_ADMIN_PAGE_BACKEND, DependencyStatus.HEALTHY, "Connection successfull"));
            responseObject.Dependencies.Add(await GetStorageAccountStatus());
            responseObject.Dependencies.Add(GetKeyVaultStatus());
            responseObject.Dependencies.Add(GetDatabaseStatus());
            responseObject.Dependencies.Add(await GetTeamsAppRegStatus());

            return Ok(responseObject);
        }

        #endregion Get dependency Status

        #region Manifest

        private async Task<bool> TryUploadManifest(string displayName, string shortDescription, string longDescription, string apiDomain, string clientId, string version)
        {
            string delegatedToken = Request.Headers[HeaderNames.Authorization].ToString().Replace("Bearer", string.Empty).Replace(" ", string.Empty);
            Microsoft.Graph.GraphServiceClient graphClient = _graphApiEngine.AuthorizeWithOnBehalfOfTokenAdminPage(delegatedToken);

            shortDescription = shortDescription.Replace("\n", " ");
            longDescription = longDescription.Replace("\n", "\\n");

            string manifestJsonString = await System.IO.File.ReadAllTextAsync("Templates/Manifest/manifest.json");

            manifestJsonString = manifestJsonString.Replace("{{{proTeamsAppId}}}", StaticSettings.ENTERPRISE_APP_MANIFEST_GUID);
            manifestJsonString = manifestJsonString.Replace("{{{displayName}}}", displayName);
            manifestJsonString = manifestJsonString.Replace("{{{shortDescription}}}", shortDescription);
            manifestJsonString = manifestJsonString.Replace("{{{longDescription}}}", longDescription);
            manifestJsonString = manifestJsonString.Replace("{{{clientId}}}", clientId);
            manifestJsonString = manifestJsonString.Replace("{{{version}}}", version);
            manifestJsonString = manifestJsonString.Replace("{{{domain}}}", apiDomain);

            //ByteArrayContent zipAsByteContent;
            using MemoryStream zipStream = new MemoryStream();
            {
                using (ZipArchive zip = new ZipArchive(zipStream, ZipArchiveMode.Create, true))
                {
                    ZipArchiveEntry manifest = zip.CreateEntry("manifest.json");
                    using (StreamWriter sw = new StreamWriter(manifest.Open()))
                    {
                        await sw.WriteLineAsync(manifestJsonString);
                    }

                    zip.CreateEntryFromFile("Templates/Manifest/icon-color.png", "icon-color.png");
                    zip.CreateEntryFromFile("Templates/Manifest/icon-outline.png", "icon-outline.png");
                }
            }

            ByteArrayContent zipAsByteContent;
            zipAsByteContent = new ByteArrayContent(zipStream.ToArray());
            zipAsByteContent.Headers.Remove("Content-Type");
            zipAsByteContent.Headers.Add("Content-Type", "application/zip");
            // Add this to save the zip, which will be pushed, locally
            //using (var writer = new BinaryWriter(System.IO.File.OpenWrite("C:\\temp\\test.zip")))
            //{
            //    writer.Write(zipStream.ToArray());
            //}

            HttpClient client = _httpClientFactory.CreateClient("default");

            TeamsAppCollectionResponse? ucTeamsApp = (await graphClient.AppCatalogs.TeamsApps.GetAsync((requestConfiguration) =>
            {
                requestConfiguration.QueryParameters.Filter = $"externalId eq '{StaticSettings.ENTERPRISE_APP_MANIFEST_GUID}'";
                requestConfiguration.QueryParameters.Select = new string[] { "Id" };
            }));

            if (ucTeamsApp == null || ucTeamsApp.Value.IsNullOrEmpty())
            {
                //Teams app does not exist -> initial publish upload manifest
                RequestInformation publishRequest = graphClient.AppCatalogs.TeamsApps.ToGetRequestInformation();

                publishRequest.Content = await zipAsByteContent.ReadAsStreamAsync();
                publishRequest.Headers.Remove("Content-Type");
                publishRequest.Headers.Add("Content-Type", "application/zip");
                publishRequest.HttpMethod = Method.POST;
                Dictionary<string, ParsableFactory<IParsable>> errorMapping = new Dictionary<string, ParsableFactory<IParsable>>
                {
                    { "XXX", Microsoft.Graph.Models.ODataErrors.ODataError.CreateFromDiscriminatorValue },
                };
                TeamsApp? response = await graphClient.RequestAdapter.SendAsync(publishRequest, Microsoft.Graph.Models.TeamsApp.CreateFromDiscriminatorValue, errorMapping);
                return true;
            }
            else
            {
                //Teams app does exist - check if version in sync
                TeamsAppDefinition? ucTeamsAppDefinition = (await graphClient.AppCatalogs.TeamsApps[ucTeamsApp.Value.First().Id].AppDefinitions.GetAsync())?.Value?.FirstOrDefault();
                if (ucTeamsAppDefinition == null || ucTeamsAppDefinition.Version != version)
                {
                    //No App Definition or AppDefintion with different version -> update existing app
                    RequestInformation updateRequest = graphClient.AppCatalogs.TeamsApps[ucTeamsApp.Value.First().Id].AppDefinitions.ToGetRequestInformation();

                    updateRequest.Content = await zipAsByteContent.ReadAsStreamAsync();
                    updateRequest.Headers.Remove("Content-Type");
                    updateRequest.Headers.Add("Content-Type", "application/zip");
                    updateRequest.HttpMethod = Method.POST;
                    Dictionary<string, ParsableFactory<IParsable>> errorMapping = new Dictionary<string, ParsableFactory<IParsable>>
                {
                    { "XXX", Microsoft.Graph.Models.ODataErrors.ODataError.CreateFromDiscriminatorValue },
                };
                    TeamsApp? response = await graphClient.RequestAdapter.SendAsync(updateRequest, Microsoft.Graph.Models.TeamsApp.CreateFromDiscriminatorValue, errorMapping);

                    return true;
                }
            }

            return false;
        }

        [HttpGet("manifest")]
        public async Task<ActionResult<GetManifestInfoResponse>> GetManifestInfo()
        {
            string delegatedToken = Request.Headers[HeaderNames.Authorization].ToString().Replace("Bearer", string.Empty).Replace(" ", string.Empty);
            Microsoft.Graph.GraphServiceClient graphClient = _graphApiEngine.AuthorizeWithOnBehalfOfTokenAdminPage(delegatedToken);

            TeamsAppDefinition? ucTeamsApp = (await graphClient.AppCatalogs.TeamsApps.GetAsync((requestConfiguration) =>
            {
                requestConfiguration.QueryParameters.Filter = $"externalId eq '{StaticSettings.ENTERPRISE_APP_MANIFEST_GUID}'";
                requestConfiguration.QueryParameters.Select = new string[] { "Id" };
                requestConfiguration.QueryParameters.Expand = new string[] { "appDefinitions($select=version)" };
            }))?.Value?.FirstOrDefault()?.AppDefinitions?.FirstOrDefault();

            if (ucTeamsApp == null)
            {
                return Ok(new GetManifestInfoResponse()
                {
                    TeamsManifestExists = false,
                    TeamsManifestUpdatePossible = true,
                    ApiVersion = StaticSettings.VERSION
                });
            }

            TeamsAppDefinition appDefinitions = ucTeamsApp;

            if (appDefinitions != null && appDefinitions.Version != null)
            {
                return Ok(new GetManifestInfoResponse()
                {
                    TeamsManifestExists = true,
                    TeamsManifestUpdatePossible = appDefinitions.Version != StaticSettings.MANIFEST_VERSION && StaticSettings.VERSION != "/INTERNAL_BUILD/",
                    TeamsManifestVersion = appDefinitions.Version,
                    ApiVersion = StaticSettings.VERSION
                });
            }

            return StatusCode(StatusCodes.Status500InternalServerError, "Version could not be acquired");
        }

        [HttpPost("manifest")]
        public async Task<ActionResult> UploadManifestInfo()
        {
            ManifestSettingsDto manifestSettings = await _settingsRepository.GetManifestSettings();
            if (manifestSettings.DisplayName == null || manifestSettings.ShortDescription == null || manifestSettings.LongDescription == null || manifestSettings.ApiDomain == null || _authSettings.ClientId == null)
            {
                return StatusCode(StatusCodes.Status409Conflict, "Necessary settings are missing");
            }

            bool manifestUpdateSuccessfull = false;
            try
            {
                manifestUpdateSuccessfull = await TryUploadManifest(manifestSettings.DisplayName, manifestSettings.ShortDescription, manifestSettings.LongDescription, manifestSettings.ApiDomain, _authSettings.ClientId, StaticSettings.MANIFEST_VERSION);
            }
            catch (HttpResponseException e)
            {
                string errorResponse = await e.Response.Content.ReadAsStringAsync();
                return new ContentResult()
                {
                    StatusCode = StatusCodes.Status500InternalServerError,
                    Content = errorResponse,
                    ContentType = "application/json"
                };
            }

            if (manifestUpdateSuccessfull)
            {
                return StatusCode(StatusCodes.Status202Accepted);
            }
            else
            {
                return StatusCode(StatusCodes.Status406NotAcceptable, "Version could not be updated");
            }
        }

        [HttpGet("manifest/settings")]
        public async Task<ActionResult<GetManifestSettingsResponse>> GetManifestSettings()
        {
            ManifestSettingsDto manifestSettings = await _settingsRepository.GetManifestSettings();

            return Ok(new GetManifestSettingsResponse()
            {
                ClientId = _authSettings.ClientId,
                DisplayName = manifestSettings.DisplayName ?? "Unified Contacts",
                ShortDescription = manifestSettings.ShortDescription ?? "Finding ALL your Contacts in Microsoft Teams, Outlook & Microsoft 365",
                LongDescription = manifestSettings.LongDescription ?? "Unified Contacts extends Microsoft Teams, Outlook and Microsoft 365 by delivering a unified search experience for the two most popular address books: EntraId (fka: Azure Active Directory) and Microsoft Exchange Online aswell as your custom address books from SharePoint or your Unified Contacts database.\n\nWith Unified Contacts you can simultaneously search your Entra Id for corporate contacts, Exchange Online address book for personal and other organization-wide contacts and even custom contacts from SharePoint or your Unified Contacts database. Search results will be presented in a unified, well-structured, and comprehensive result page displaying contacts from all sources.\n\nIf your contacts contain multiple phone numbers, Unified Contacts allows easy selection of your desired phone number for dialing (dialing requires Microsoft Teams Phone System enabled users). In addition, you can directly initiate a Microsoft Teams call, start a Microsoft Teams chat, or write a mail from the contact card. For internal users the presence status is displayed as well.\n\nUnified Contacts searches contacts by\n- First name\n- Last name\n- Job title\n- Department\n- Organization name\n\nFor more information on features and technical details, please refer to our [documentation](https://docs.unified-contacts.com/).",
                ApiDomain = manifestSettings.ApiDomain
            });
        }

        [HttpPost("manifest/settings")]
        public async Task<ActionResult> SetManifestSettings([FromBody] SetManifestSettingsPayload body)
        {
            if (body.DisplayName == null || body.ShortDescription == null || body.LongDescription == null || body.ApiDomain == null)
            {
                return StatusCode(StatusCodes.Status400BadRequest);
            }

            if (_authSettings.ClientId == null)
            {
                return StatusCode(StatusCodes.Status409Conflict);
            }

            //validate parameters
            if (body.DisplayName.Length > 30 || body.ShortDescription.Length > 80 || body.LongDescription.Length > 4000 || body.ApiDomain.Length > 1500)
            {
                return StatusCode(StatusCodes.Status400BadRequest, "One or more parameters are formated incorrectly.");
            }

            ManifestSettingsDto manifestSettings = new ManifestSettingsDto() { DisplayName = body.DisplayName, ApiDomain = body.ApiDomain, LongDescription = body.LongDescription, ShortDescription = body.ShortDescription };
            await _settingsRepository.SetManifestSettings(manifestSettings);

            //await TryUploadManifest(body.DisplayName, body.ShortDescription, body.LongDescription, body.ApiDomain, _authSettings.ClientId, StaticSettings.VERSION);

            return StatusCode(StatusCodes.Status202Accepted);
        }

        #endregion Manifest

        #region Update

        // Cache shields the admin page from GitHub's unauthenticated rate limit (60 requests/hour per ip)
        private static VersionManifestDto? _cachedVersionManifest;
        private static DateTime _cachedVersionManifestExpiry = DateTime.MinValue;
        private static readonly SemaphoreSlim _versionManifestLock = new(1, 1);

        private async Task<VersionManifestDto> GetVersionManifest()
        {
            if (_cachedVersionManifest != null && DateTime.UtcNow < _cachedVersionManifestExpiry)
            {
                return _cachedVersionManifest;
            }

            await _versionManifestLock.WaitAsync();
            try
            {
                if (_cachedVersionManifest != null && DateTime.UtcNow < _cachedVersionManifestExpiry)
                {
                    return _cachedVersionManifest;
                }

                try
                {
                    VersionManifestDto manifest = await FetchVersionManifestFromGitHub();
                    _cachedVersionManifest = manifest;
                    _cachedVersionManifestExpiry = DateTime.UtcNow.AddMinutes(5);
                    return manifest;
                }
                catch when (_cachedVersionManifest != null)
                {
                    // Serve stale data instead of a 500 when GitHub is unavailable or rate-limited
                    return _cachedVersionManifest;
                }
            }
            finally
            {
                _versionManifestLock.Release();
            }
        }

        private async Task<VersionManifestDto> FetchVersionManifestFromGitHub()
        {
            HttpClient client = _httpClientFactory.CreateClient("default");
            using HttpRequestMessage request = new(HttpMethod.Get, StaticSettings.GITHUB_RELEASES_URL);
            // GitHub API rejects requests without a user agent
            request.Headers.UserAgent.ParseAdd("UnifiedContacts");
            HttpResponseMessage versionManifestRequest = await client.SendAsync(request);
            versionManifestRequest.EnsureSuccessStatusCode();
            string releasesJsonString = await versionManifestRequest.Content.ReadAsStringAsync();
            List<GitHubReleaseDto>? releases = JsonSerializer.Deserialize<List<GitHubReleaseDto>>(releasesJsonString, JsonSerializerOptionsDefaults.GetDefaultOptions());

            if (releases == null)
            {
                throw new Exception("GitHub releases could not be acquired");
            }

            static VersionManifestDtoChannel? ToChannel(GitHubReleaseDto? release, string name, bool isDefault)
            {
                string? binariesUrl = release?.Assets?.FirstOrDefault(asset => asset.Name == StaticSettings.RELEASE_BINARIES_ASSET_NAME)?.BrowserDownloadUrl;
                if (release == null || binariesUrl == null)
                {
                    return null;
                }
                return new VersionManifestDtoChannel
                {
                    Default = isDefault,
                    Name = name,
                    LatestVersion = release.TagName,
                    LatestVersionRef = binariesUrl
                };
            }

            List<VersionManifestDtoChannel> channels = new();
            VersionManifestDtoChannel? stable = ToChannel(releases.FirstOrDefault(release => !release.Draft && !release.Prerelease), "stable", true);
            if (stable != null)
            {
                channels.Add(stable);
            }
            VersionManifestDtoChannel? prerelease = ToChannel(releases.FirstOrDefault(release => !release.Draft && release.Prerelease), "prerelease", false);
            if (prerelease != null)
            {
                channels.Add(prerelease);
            }

            if (channels.Count == 0)
            {
                throw new Exception("No usable releases found on GitHub");
            }

            return new VersionManifestDto { Channels = channels };
        }

        /// <summary>
        /// Acquires the Manifest and returns the channel meta info for specified channel name. If channelName does not exist the default channel is returned
        /// </summary>
        /// <param name="channelName">Channel name to be found</param>
        /// <returns>channe</returns>
        private async Task<VersionManifestDtoChannel> GetManifestChannelOrDefault(string channelName)
        {
            VersionManifestDto versionManifest = await GetVersionManifest();

            return GetManifestChannelOrDefault(versionManifest, channelName);
        }

        /// <summary>
        /// Returns the channel meta info for specified channel name. If channelName does not exist the default channel is returned
        /// </summary>
        /// <param name="channelName">Channel name to be found</param>
        /// <param name="versionManifest">VersionManifest to extract the channel from</param>
        /// <returns>channe</returns>
        private VersionManifestDtoChannel GetManifestChannelOrDefault(VersionManifestDto versionManifest, string channelName)
        {
            VersionManifestDtoChannel? manifestInfoOfSelectedChannel = versionManifest!.Channels?.Where(channel => string.Equals(channel.Name, channelName, StringComparison.OrdinalIgnoreCase)).FirstOrDefault();

            if (manifestInfoOfSelectedChannel == null)
            {
                manifestInfoOfSelectedChannel = versionManifest!.Channels?.Where(channel => channel.Default).FirstOrDefault();
                if (manifestInfoOfSelectedChannel == null)
                {
                    throw new Exception($"no default channel found");
                }
            }

            return manifestInfoOfSelectedChannel;
        }

        #endregion Update

        #region Licensing

        [HttpGet("version/update")]
        public async Task<ActionResult<GetVersionUpdateInfoResponse>> GetVersionUpdateInfo()
        {
            string? selectedChannel = await _settingsRepository.GetValue("releaseChannel", "update");
            if (selectedChannel == null)
            {
                selectedChannel = "stable";
            }

            VersionManifestDto versionManifest = await GetVersionManifest();
            VersionManifestDtoChannel manifestInfoOfSelectedChannel = GetManifestChannelOrDefault(versionManifest, selectedChannel);

            return Ok(new GetVersionUpdateInfoResponse()
            {
                UpdateInProgress = _updateStatusDto.IsUpdatePending,
                RestartRequired = _updateStatusDto.RestartRequired,
                UpdateAvailable = StaticSettings.VERSION != manifestInfoOfSelectedChannel.LatestVersion,
                CurrentVersion = StaticSettings.VERSION,
                UpdateVersion = manifestInfoOfSelectedChannel.LatestVersion,
                SelectedChannel = manifestInfoOfSelectedChannel.Name,
                AvaliableChannels = versionManifest.Channels?.Where(channel => channel.Name != null).ToList().ConvertAll(channel => channel.Name!),
                AppServiceAzureUrl = _appServiceSettings.AppServiceAzureUrl
            });
        }

        [HttpPost("version/update")]
        public async Task<ActionResult> UpdateUnifiedContacts()
        {
            try
            {
                if (_updateStatusDto.IsUpdatePending)
                {
                    return StatusCode(StatusCodes.Status409Conflict, "Update already in progress");
                }
                _updateStatusDto.IsUpdatePending = true;
                _updateStatusDto.UpdateStartTimestamp = DateTime.UtcNow;

                string? selectedChannel = await _settingsRepository.GetValue("releaseChannel", "update");
                if (selectedChannel == null)
                {
                    selectedChannel = "stable";
                }

                VersionManifestDtoChannel channelInfo = await GetManifestChannelOrDefault(selectedChannel);
                if (channelInfo == null || channelInfo.LatestVersionRef == null)
                {
                    _updateStatusDto.IsUpdatePending = false;
                    return StatusCode(StatusCodes.Status500InternalServerError, "Could not get version to update");
                }

                if (_blobServiceDto.Client == null)
                {
                    _updateStatusDto.IsUpdatePending = false;
                    return StatusCode(StatusCodes.Status400BadRequest, "Blobstorage is not setup");
                }

                Azure.Storage.Blobs.BlobClient blobClient = _blobServiceDto.Client.GetBlobContainerClient(StaticSettings.BLOB_STORAGE_CONTAINER_NAME).GetBlobClient(StaticSettings.BLOB_STORAGE_BLOB_NAME);
                // GitHub asset urls answer with a 302 redirect which Azure server-side copy cannot follow - stream the download instead
                _ = Task.Run(async () =>
                {
                    try
                    {
                        HttpClient downloadClient = _httpClientFactory.CreateClient("default");
                        using HttpRequestMessage downloadRequest = new(HttpMethod.Get, channelInfo.LatestVersionRef);
                        downloadRequest.Headers.UserAgent.ParseAdd("UnifiedContacts");
                        using HttpResponseMessage downloadResponse = await downloadClient.SendAsync(downloadRequest, HttpCompletionOption.ResponseHeadersRead);
                        downloadResponse.EnsureSuccessStatusCode();
                        using Stream assetStream = await downloadResponse.Content.ReadAsStreamAsync();
                        await blobClient.UploadAsync(assetStream, overwrite: true);
                        _updateStatusDto.RestartRequired = true;
                        _updateStatusDto.IsUpdatePending = false;
                    }
                    catch (Exception)
                    {
                        _updateStatusDto.IsUpdatePending = false;
                        _updateStatusDto.RestartRequired = false;
                    }
                });

                return StatusCode(StatusCodes.Status202Accepted);
            }
            catch (Exception)
            {
                _updateStatusDto.IsUpdatePending = false;
                return StatusCode(StatusCodes.Status500InternalServerError);
            }
        }

        [HttpGet("version/update/progress")]
        public ActionResult<GetIsUpdateInProgressResponse> GetIsUpdateInProgress()
        {
            return Ok(new GetIsUpdateInProgressResponse() { IsUpdateInProgress = _updateStatusDto.IsUpdatePending, RestartRequired = _updateStatusDto.RestartRequired });
        }

        [HttpPut("version/update/settings")]
        public async Task<ActionResult> SetVersionUpdateSettings([FromBody] SetVersionUpdateSettingsPayload body)
        {
            await _settingsRepository.SetValue("releaseChannel", "update", body.SelectedReleaseChannel);
            return StatusCode(StatusCodes.Status204NoContent);
        }

        #endregion Licensing

        #region Settings

        [HttpGet("settings/{categoryId}/{settingId}")]
        public async Task<ActionResult<GetSettingValueResponse>> GetSettingValue([FromRoute(Name = "categoryId")] string categoryId, [FromRoute(Name = "settingId")] string settingId)
        {
            return Ok(new GetSettingValueResponse() { Value = await _settingsRepository.GetValue(settingId, categoryId) });
        }

        [HttpPost($"settings/{UnifiedContactStaticStrings.SETTINGS_SBC_LOOKUP_CATEGORY_ID}/{UnifiedContactStaticStrings.SETTINGS_SBC_LOOKUP_CREDENTIALS_SETTING_ID}")]
        public async Task<ActionResult> SetSbcLookupCredentials([FromBody] SetSettingValuePayload body)
        {
            string? hashedCredential = null;
            if (body.Value != null)
            {
                string[] splittedBody = body.Value.Split(":");
                if (splittedBody.Length != 2 || splittedBody[0].Length < StaticSettings.MIN_LENGTH_SBC_LOOKUP_USERNAME || splittedBody[1].Length < StaticSettings.MIN_LENGTH_SBC_LOOKUP_PASSWORD)
                {
                    return StatusCode(StatusCodes.Status400BadRequest, "Invalid Credentials provided");
                }
                hashedCredential = _sbcLookupEngine.GetCredentialHash(Encoding.UTF8.GetBytes(body.Value));
            }

            await _settingsRepository.SetValue(UnifiedContactStaticStrings.SETTINGS_SBC_LOOKUP_CREDENTIALS_SETTING_ID, UnifiedContactStaticStrings.SETTINGS_SBC_LOOKUP_CATEGORY_ID, hashedCredential);
            // Store last modified info
            await _settingsRepository.SetValue(UnifiedContactStaticStrings.SETTINGS_SBC_LOOKUP_CREDENTIALS_LAST_MODIFIED_BY_ID, UnifiedContactStaticStrings.SETTINGS_SBC_LOOKUP_CATEGORY_ID, User.GetObjectUPN());
            await _settingsRepository.SetValue(UnifiedContactStaticStrings.SETTINGS_SBC_LOOKUP_CREDENTIALS_LAST_MODIFIED_ID, UnifiedContactStaticStrings.SETTINGS_SBC_LOOKUP_CATEGORY_ID, DateTime.UtcNow.ToString("o"));

            await _settingsRepository.UpdateRuntimeInfo();
            return StatusCode(StatusCodes.Status204NoContent);
        }

        [HttpPost("settings/{categoryId}/{settingId}")]
        public async Task<ActionResult> SetSettingValue([FromRoute(Name = "categoryId")] string categoryId, [FromRoute(Name = "settingId")] string settingId, [FromBody] SetSettingValuePayload body, [FromQuery] bool updateRuntimeInfo = false)
        {
            await _settingsRepository.SetValue(settingId, categoryId, body.Value);
            if (updateRuntimeInfo)
            {
                await _settingsRepository.UpdateRuntimeInfo();
            }
            return StatusCode(StatusCodes.Status204NoContent);
        }

        [HttpGet("settings/{categoryId}")]
        public async Task<ActionResult<GetAllSettingValuesOfCategoryResponse>> GetAllSettingValuesOfCategory([FromRoute(Name = "categoryId")] string categoryId)
        {
            IEnumerable<Models.DbTables.AdminSettingsDB> settings = await _settingsRepository.GetValues(categoryId);
            GetAllSettingValuesOfCategoryResponse response = new GetAllSettingValuesOfCategoryResponse(categoryId)
            {
                Settings = settings.ToList().ConvertAll(setting => new GetAllSettingValuesOfCategoryValues(setting.Key, setting.Value))
            };
            return Ok(response);
        }

        [HttpPost("settings/{categoryId}")]
        public async Task<ActionResult> SetAllSettingValuesOfCategory([FromRoute(Name = "categoryId")] string categoryId, [FromBody] SetAllSettingValuesOfCategoryPayload body, [FromQuery] bool updateRuntimeInfo = false)
        {
            try
            {
                foreach (SetAllSettingValuesOfCategorySetting setting in body.Values)
                {
                    await _settingsRepository.SetValue(setting.SettingId, categoryId, setting.Value);
                }

                if (updateRuntimeInfo)
                {
                    await _settingsRepository.UpdateRuntimeInfo();
                }

                return StatusCode(StatusCodes.Status204NoContent);
            }
            catch (Exception)
            {
                return StatusCode(StatusCodes.Status409Conflict, "An error occurred while saving one or more settings. Please refresh your configuration and try again.");
            }
        }

        #endregion Settings

        #region Metrics

        [HttpGet("metrics")]
        public async Task<ActionResult<GetMetricsResponse>> GetMetrics()
        {
            GetMetricsResponse response = await _adminControllerEngine.GetMetricsAsync();
            return Ok(response);
        }

        #endregion Metrics

        #region EntraIdFilter

        [HttpPut($"settings/{UnifiedContactStaticStrings.SETTINGS_ENTRAIDFILTER_CATEGORY}/{UnifiedContactStaticStrings.SETTINGS_ENTRAIDFILTER_ID}/{{id}}")]
        public async Task<ActionResult> SetEntraIdFilter([FromRoute(Name = "id")] string filterIdAsString, [FromBody] EntraIdFilterPayload filter)
        {
            try
            {
                if (!Guid.TryParse(filterIdAsString, out Guid filterId))
                {
                    return StatusCode(StatusCodes.Status404NotFound);
                }

                await _adminControllerEngine.UpdateEntraIdFilter(filterId, filter);

                return StatusCode(StatusCodes.Status204NoContent);
            }
            catch (EntraIdFilterNotFoundException)
            {
                return StatusCode(StatusCodes.Status404NotFound);
            }
            catch (Exception)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, "An error occurred while saving one or more settings. Please refresh your configuration and try again.");
            }
        }

        [HttpPost($"settings/{UnifiedContactStaticStrings.SETTINGS_ENTRAIDFILTER_CATEGORY}/{UnifiedContactStaticStrings.SETTINGS_ENTRAIDFILTER_ID}")]
        public async Task<ActionResult> CreateEntraIdFilter([FromBody] EntraIdFilterPayload filter)
        {
            try
            {
                await _adminControllerEngine.CreateEntraIdFilter(filter);
                return StatusCode(StatusCodes.Status201Created);
            }
            catch (EntraIdFilterLimitExceededException e)
            {
                return StatusCode(StatusCodes.Status400BadRequest, e.Message);
            }
            catch (Exception)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, "An error occurred while saving one or more settings. Please refresh your configuration and try again.");
            }
        }

        [HttpDelete($"settings/{UnifiedContactStaticStrings.SETTINGS_ENTRAIDFILTER_CATEGORY}/{UnifiedContactStaticStrings.SETTINGS_ENTRAIDFILTER_ID}/{{id}}")]
        public async Task<ActionResult> DeleteEntraIdFilter([FromRoute(Name = "id")] string filterIdAsString)
        {
            try
            {
                if (!Guid.TryParse(filterIdAsString, out Guid filterId))
                {
                    return StatusCode(StatusCodes.Status404NotFound);
                }

                await _adminControllerEngine.DeleteEntraIdFilter(filterId);
                return StatusCode(StatusCodes.Status204NoContent);
            }
            catch (EntraIdFilterNotFoundException)
            {
                return StatusCode(StatusCodes.Status404NotFound);
            }
            catch (Exception)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, "An error occurred while deleting one or more settings. Please refresh your configuration and try again.");
            }
        }

        #endregion EntraIdFilter
    }
}