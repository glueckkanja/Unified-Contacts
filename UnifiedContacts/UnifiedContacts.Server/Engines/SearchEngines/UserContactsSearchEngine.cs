using Microsoft.Graph;
using Microsoft.Graph.Models;
using Microsoft.Kiota.Abstractions;
using System.Security.Claims;
using UnifiedContacts.Interfaces;
using UnifiedContacts.Models;
using UnifiedContacts.Models.Dto;
using UnifiedContacts.Settings;
using UnifiedContacts.Statics;

namespace UnifiedContacts.Engines.SearchEngines
{
    public class UserContactsSearchEngine : ISearchEngine
    {
        private readonly IGraphApiEngine _graphApiEngine;
        private readonly AuthSettings _authSettings;

        private const string SEARCH_QUERY_PLACEHOLDER = "{{{SEARCH_QUERY_PLACEHOLDER}}}";
        private const string USER_CONTACTS_GRAPH_FILTER_TEMPLATE = $"startswith(displayName, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(givenName, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(surname, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(department, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(jobTitle, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(companyName, '{SEARCH_QUERY_PLACEHOLDER}') or emailAddresses/any(a:a/address eq '{SEARCH_QUERY_PLACEHOLDER}')";

        public UserContactsSearchEngine(IGraphApiEngine graphApiEngine, AuthSettings authSettings)
        {
            _graphApiEngine = graphApiEngine;
            _authSettings = authSettings;
        }

        private List<SearchEngineResultDto> ConvertToSearchEnginerResults(IEnumerable<Contact> contacts)
        {
            List<SearchEngineResultDto> returnDtos = new List<SearchEngineResultDto>();
            foreach (Contact contact in contacts)
            {
                string? contactDisplayName = contact.DisplayName;
                if (string.IsNullOrWhiteSpace(contactDisplayName))
                {
                    contactDisplayName = $"{contact.GivenName} {contact.MiddleName} {contact.Surname}";
                    contactDisplayName = contactDisplayName.Replace("  ", " ").Trim(); // If contact has no middle name two consecutive spaces are present -> Clean them up
                    if (string.IsNullOrWhiteSpace(contactDisplayName))
                    {
                        contactDisplayName = contact.NickName ?? " ";
                    }
                }

                SearchEngineResultDto searchResult = new SearchEngineResultDto($"{UnifiedContactStaticStrings.CONTACT_ID_PREFIX_USER_CONTACT}_{contact.Id}", UnifiedContactsSource.USER_CONTACT)
                {
                    DisplayName = contactDisplayName,
                    JobTitle = contact.JobTitle,
                    Department = contact.Department,
                    CompanyName = contact.CompanyName,
                    ImAddresses = contact.ImAddresses.ToList()
                };

                searchResult.MailAddresses.AddRange(contact.EmailAddresses.ToList().ConvertAll(mailAddress => mailAddress.Address));
                searchResult.PhoneNumbers.Business.AddRange(contact.BusinessPhones);
                searchResult.PhoneNumbers.Home.AddRange(contact.HomePhones);
                searchResult.PhoneNumbers.Mobile.Add(contact.MobilePhone);

                if (contact.BusinessAddress != null && (!string.IsNullOrEmpty(contact.BusinessAddress.Street) || !string.IsNullOrEmpty(contact.BusinessAddress.PostalCode) || !string.IsNullOrEmpty(contact.BusinessAddress.City) || !string.IsNullOrEmpty(contact.BusinessAddress.CountryOrRegion)))
                {
                    searchResult.Addresses.Business.Add(new SearchResultAddress(contact.BusinessAddress.Street, contact.BusinessAddress.PostalCode, contact.BusinessAddress.City, contact.BusinessAddress.CountryOrRegion));
                }

                if (contact.HomeAddress != null && (!string.IsNullOrEmpty(contact.HomeAddress.Street) || !string.IsNullOrEmpty(contact.HomeAddress.PostalCode) || !string.IsNullOrEmpty(contact.HomeAddress.City) || !string.IsNullOrEmpty(contact.HomeAddress.CountryOrRegion)))
                {
                    searchResult.Addresses.Home.Add(new SearchResultAddress(contact.HomeAddress.Street, contact.HomeAddress.PostalCode, contact.HomeAddress.City, contact.HomeAddress.CountryOrRegion));
                }

                if (contact.OtherAddress != null && (!string.IsNullOrEmpty(contact.OtherAddress.Street) || !string.IsNullOrEmpty(contact.OtherAddress.PostalCode) || !string.IsNullOrEmpty(contact.OtherAddress.City) || !string.IsNullOrEmpty(contact.OtherAddress.CountryOrRegion)))
                {
                    searchResult.Addresses.Other.Add(new SearchResultAddress(contact.OtherAddress.Street, contact.OtherAddress.PostalCode, contact.OtherAddress.City, contact.OtherAddress.CountryOrRegion));
                }

                returnDtos.Add(searchResult);
            }
            return returnDtos;
        }

        public async Task<IEnumerable<SearchEngineResultDto>> SearchContactAsync(string searchQuery, string delegatedToken, ClaimsPrincipal userPrincipal)
        {
            GraphServiceClient graphClient = _graphApiEngine.AuthorizeWithOnBehalfOfToken(delegatedToken);
            ContactCollectionResponse? contacts;

            try
            {
                contacts = await graphClient.Me.Contacts.GetAsync((requestConfiguration) =>
                {
                    requestConfiguration.QueryParameters.Filter = USER_CONTACTS_GRAPH_FILTER_TEMPLATE.Replace(SEARCH_QUERY_PLACEHOLDER, ODataFilterHelper.EscapeODataStringLiteral(searchQuery));
                    requestConfiguration.QueryParameters.Select = new string[] { "id", "displayName", "imAddresses", "mobilePhone", "businessPhones", "companyName", "department", "jobTitle", "businessAddress", "homeAddress", "otherAddress", "emailAddresses", "homePhones", "givenName", "surName", "middleName", "nickName" };
                    requestConfiguration.Headers.Add("ConsistencyLevel", "eventual");
                    requestConfiguration.QueryParameters.Count = true;
                });
            }
            catch (ApiException e)
            {
                if (e.ResponseStatusCode == StatusCodes.Status403Forbidden)
                {
                    throw new UnauthorizedAccessException("Forbidden");
                }

                // This means the user has no Mailbox
                if (e.ResponseStatusCode == StatusCodes.Status403Forbidden)
                {
                    return Enumerable.Empty<SearchEngineResultDto>();
                }

                throw;
            }

            return ConvertToSearchEnginerResults(contacts.Value);
        }

        public async Task<IEnumerable<SearchEngineResultDto>> GetFavoritesAsync(IEnumerable<string> contactIds, string delegatedToken, ClaimsPrincipal userPrincipal)
        {
            List<string> userContactIds = contactIds.Where(contactId => contactId.StartsWith($"{UnifiedContactStaticStrings.CONTACT_ID_PREFIX_USER_CONTACT}_")).ToList().ConvertAll(contactId => contactId.Replace($"{UnifiedContactStaticStrings.CONTACT_ID_PREFIX_USER_CONTACT}_", string.Empty));
            if (userContactIds.Count == 0)
            {
                return Enumerable.Empty<SearchEngineResultDto>();
            }

            GraphServiceClient graphClient = _graphApiEngine.AuthorizeWithOnBehalfOfToken(delegatedToken);

            Dictionary<string, Contact> userContactsItemBatchResponses = [];
            try
            {
                Dictionary<string, HttpRequestMessage> userContactsBatchRequests = new Dictionary<string, HttpRequestMessage>();
                RequestInformation orgContactsBatchRequests = new RequestInformation();
                BatchRequestContentCollection batchRequestContent = new BatchRequestContentCollection(graphClient);
                List<string> stepIds = new List<string>();
                foreach (string? userContactId in userContactIds)
                {
                    orgContactsBatchRequests = graphClient.Me.Contacts[userContactId].ToGetRequestInformation((requestConfiguration) =>
                    {
                        requestConfiguration.QueryParameters.Select = new string[] { "id", "imAddresses", "displayName", "mobilePhone", "businessPhones", "companyName", "jobTitle", "department", "businessAddress", "homeAddress", "otherAddress", "emailAddresses", "homePhones", "givenName", "surName", "middleName", "nickName" };
                    });
                    stepIds.Add(await batchRequestContent.AddBatchRequestStepAsync(orgContactsBatchRequests));
                }

                BatchResponseContentCollection batchResponseContent = await graphClient.Batch.PostAsync(batchRequestContent);
                foreach (string step in stepIds)
                {
                    Contact contact = await batchResponseContent.GetResponseByIdAsync<Contact>(step);
                    if (contact != null)
                    {
                        userContactsItemBatchResponses.Add(step, contact);
                    }
                }
            }
            catch (ApiException e)
            {
                if (e.ResponseStatusCode == (int)System.Net.HttpStatusCode.Forbidden)
                {
                    throw new UnauthorizedAccessException("Forbidden");
                }

                // This means the user has no Mailbox
                if (e.ResponseStatusCode == (int)System.Net.HttpStatusCode.NotFound)
                {
                    return Enumerable.Empty<SearchEngineResultDto>();
                }

                throw;
            }
            return ConvertToSearchEnginerResults(userContactsItemBatchResponses.Values);
        }
    }
}