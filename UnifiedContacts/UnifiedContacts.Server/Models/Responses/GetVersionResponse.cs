using System.Text.Json.Serialization;
using UnifiedContacts.Settings;

namespace UnifiedContacts.Models.Responses
{
    public class GetVersionResponse
    {
        /// <summary>
        /// Version of UnifiedContacts environment
        /// </summary>
        [JsonPropertyName("version")]
        public string Version { get; set; }

        /// <summary>
        /// Edition of the UnifiedContacts environment
        /// </summary>
        [JsonPropertyName("edition")]
        public string Edition { get; set; } = StaticSettings.EDITION;

        /// <summary>
        /// Default constructor
        /// </summary>
        /// <param name="version">Version of UnifiedContacts environemnt</param>
        [JsonConstructor]
        public GetVersionResponse(string version)
        {
            Version = version;
        }
    }
}
