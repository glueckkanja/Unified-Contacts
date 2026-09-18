namespace UnifiedContacts.Settings
{
    public static class StaticSettings
    {
        /// <summary>
        /// Necessary permissions in Enterprise version
        /// </summary>
        public static List<string> NECESSARY_PERMISSIONS_PRO { get; set; } = new List<string>() { "User.Read", "Contacts.Read.Shared", "Presence.Read.All", "User.Read.All", "OrgContact.Read.All", "Sites.Read.All" };

        /// <summary>
        /// Version of the UnifiedContactsEnvironment
        /// </summary>
        public const string VERSION = "/INTERNAL_BUILD/";

        public const string BLOB_STORAGE_CONTAINER_NAME = "unified-contacts";
        public const string BLOB_STORAGE_BLOB_NAME = "binaries.zip";
        public const string ENTERPRISE_APP_MANIFEST_GUID = "67977205-6c56-489f-91c7-450c1569ed3b";
        public const string GITHUB_RELEASES_URL = "https://api.github.com/repos/glueckkanja/Unified-Contacts/releases";
        public const string RELEASE_BINARIES_ASSET_NAME = "binaries.zip";
        public const int MAX_DB_CONTACTS_UC_FREE = 100;
        public const int MAX_FAVORITES_UC_FREE = 5;
        public const int MIN_LENGTH_SBC_LOOKUP_USERNAME = 3;
        public const int MIN_LENGTH_SBC_LOOKUP_PASSWORD = 16;
    }
}