using Microsoft.ApplicationInsights;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using System.Collections;
using UnifiedContacts.Engines;
using UnifiedContacts.Engines.SearchEngines;
using UnifiedContacts.Interfaces;
using UnifiedContacts.Models.Dto;
using UnifiedContacts.Models.Exceptions;
using UnifiedContacts.Models.Responses;
using UnifiedContacts.Repositories;
using UnifiedContacts.Statics;

namespace UnifiedContacts.Controllers
{
    public class SourceDetails
    {
        public readonly ISearchEngine SearchEngine;
        public readonly UnifiedContactsSource Source;

        public SourceDetails(SearchEngineFactory searchEngineFactory, UnifiedContactsSource source)
        {
            Source = source;
            SearchEngine = searchEngineFactory.AllSearchEnginesDict[source];
        }
    }

    [Route("v1.3.0/api/search")]
    [ApiController]
    [Authorize(Policy = "TeamsApp")]
    public class SearchController : ControllerBase
    {
        private readonly Dictionary<string, SourceDetails> _sourceDict;
        private readonly TelemetryClient _telemetry;
        private readonly TelemetryEngine _telemetryEngine;
        private readonly FavoritesRepository _favoritesRepository;
        private readonly UsageRepository _licensingRepository;
        private readonly RuntimeInfoDto _startupInfo;

        public SearchController(TelemetryClient telemetry, TelemetryEngine telemetryEngine, SearchEngineFactory searchEngineFactory, FavoritesRepository favoritesRepository, UsageRepository licensingRepository, RuntimeInfoDto startupInfo)
        {
            _telemetry = telemetry;
            _telemetryEngine = telemetryEngine;
            _favoritesRepository = favoritesRepository;

            _sourceDict = new Dictionary<string, SourceDetails>
            {
                { UnifiedContactStaticStrings.SOURCE_AZURE_ID, new SourceDetails(searchEngineFactory, UnifiedContactsSource.AZURE_AD) },
                { UnifiedContactStaticStrings.SOURCE_USER_CONTACTS, new SourceDetails(searchEngineFactory, UnifiedContactsSource.USER_CONTACT) },
                { UnifiedContactStaticStrings.SOURCE_ORG_CONTACTS, new SourceDetails(searchEngineFactory, UnifiedContactsSource.ORG_CONTACT) },
                { UnifiedContactStaticStrings.SOURCE_SHAREPOINT, new SourceDetails(searchEngineFactory, UnifiedContactsSource.SHAREPOINT) },
                { UnifiedContactStaticStrings.SOURCE_DATABASE, new SourceDetails(searchEngineFactory, UnifiedContactsSource.DATABASE) },
            };
            _licensingRepository = licensingRepository;
            _startupInfo = startupInfo;
        }

        private static IEnumerable<string> GetAllStringValues(object? obj)
        {
            if (obj == null)
            {
                return Enumerable.Empty<string>();
            }
            List<string?> stringValues = new List<string?>();
            System.Reflection.PropertyInfo[] propertiesOfObject = obj.GetType().GetProperties();
            foreach (System.Reflection.PropertyInfo property in propertiesOfObject)
            {
                try
                {
                    if (property.CanRead)
                    {
                        if (property.PropertyType == typeof(string))
                        {
                            stringValues.Add((string?)property.GetValue(obj));
                        }
                        else if (property.PropertyType.GetInterfaces().Contains(typeof(IEnumerable<string>)))
                        {
                            stringValues.AddRange((IEnumerable<string>)property.GetValue(obj)!);
                        }
                        else if (typeof(IEnumerable).IsAssignableFrom(property.PropertyType))
                        {
                            foreach (object? subObj in (IEnumerable)property.GetValue(obj)!)
                            {
                                stringValues.AddRange(GetAllStringValues(subObj));
                            }
                        }
                        else if (property.PropertyType.IsSubclassOf(typeof(object)))
                        {
                            stringValues.AddRange(GetAllStringValues(property.GetValue(obj)));
                        }
                    }
                }
                catch (Exception e)
                {
                    string foo = e.Message;
                }
            }

            return stringValues.Where(str => !string.IsNullOrWhiteSpace(str)).ToList().ConvertAll(str => str!);
        }

        private static IEnumerable<SearchEngineResultDto> GetResultsWithContainingSearchQuery(IEnumerable<SearchEngineResultDto> listToFilter, string searchQuery)
        {
            string[] terms = searchQuery.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (terms.Length == 0)
            {
                terms = new[] { searchQuery };
            }

            return listToFilter.Where((result) =>
            {
                List<string> allStringValues = GetAllStringValues(result).ToList();
                // Every term must match somewhere (not necessarily the same field), so "John Doe" also matches givenName="John" + surname="Doe"
                return terms.All(term => allStringValues.Any(str => str.Contains(term, StringComparison.OrdinalIgnoreCase)));
            });
        }

        /// <summary>
        /// This endpoint searches against a specified source
        /// </summary>
        /// <param name="searchQuery">Search string to be searched by</param>
        /// <param name="source">Source in which the search should be executed</param>
        /// <param name="tenantId">tenantId of the user account</param>
        /// <param name="teamsClientType">Teams clientType of device the request is coming from</param>
        /// <response code="200">Search results</response>
        /// <response code="402">This endpoint requires a valid Pro subscription</response>
        /// <response code="403">Permissions are missing to use the search against this endpoint</response>
        /// <response code="404">Source not found</response>
        [HttpGet("{source}")]
        public async Task<ActionResult<UnifiedContactsSearchResponse>> Search([FromQuery(Name = "search")] string searchQuery, [FromRoute(Name = "source")] string source, [FromQuery(Name = "tenantId")] string? tenantId = null, [FromQuery(Name = "clientType")] TeamsClientType? teamsClientType = null)
        {
            if (_sourceDict.TryGetValue(source.ToLower(), out SourceDetails? sourceDetails))
            {
                // If EnabledSources is not set we ignore the check
                if (_startupInfo.EnabledSources != null && !_startupInfo.EnabledSources.Contains(source.ToLower()))
                {
                    return StatusCode(UnifiedContactsStatusCodes.Status240SourceDisabled, "Source is disabled by an admin");
                }

                if (string.IsNullOrWhiteSpace(searchQuery))
                {
                    searchQuery = "a";
                }

                _telemetry.TrackEvent($"{source}SearchCalled", _telemetryEngine.CollectCallerTelemetryInfo(User));
                _licensingRepository.RegisterUsage(User).Forget();

                string delegatedToken = Request.Headers[HeaderNames.Authorization].ToString().Replace("Bearer", string.Empty).Replace(" ", string.Empty);

                try
                {
                    IEnumerable<SearchEngineResultDto> searchResults;
                    try
                    {
                        searchResults = await sourceDetails.SearchEngine.SearchContactAsync(searchQuery, delegatedToken, User);
                    }
                    catch (DatabaseNotConfiguredException)
                    {
                        searchResults = Enumerable.Empty<SearchEngineResultDto>();
                    }
                    string? userObjectId = User.GetObjectId();
                    List<string> favoritesIds = new List<string>();

                    if (tenantId != null && userObjectId != null)
                    {
                        try
                        {
                            IEnumerable<Models.DbTables.FavoritesDB> favs = await _favoritesRepository.GetFavoritesByTenantIdOfUser(new Guid(tenantId), new Guid(userObjectId));
                            favoritesIds = favs.Where(fav => fav != null && fav.ContactId != null).ToList().ConvertAll((fav) => fav.ContactId!);
                        }
                        catch (DatabaseNotConfiguredException)
                        {
                            favoritesIds = new List<string>();
                        }
                    }

                    searchResults = GetResultsWithContainingSearchQuery(searchResults, searchQuery);
                    searchResults.TrimAllStringValues(ignorePropertyExceptions: true); //We ignore parameter error, as this is only a optional qol improvement, that should not risk the endpoint to crash

                    _telemetryEngine.UpdateTelemetryHistoryData(sourceDetails.Source, searchResults.Count(), teamsClientType).Forget();

                    return Ok(new UnifiedContactsSearchResponse(searchResults, favoritesIds));
                }
                catch (UnauthorizedAccessException)
                {
                    return StatusCode(StatusCodes.Status403Forbidden);
                }
            }
            else
            {
                return StatusCode(StatusCodes.Status404NotFound);
            }
        }
    }
}