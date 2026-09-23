namespace UnifiedContacts.Statics
{
    public static class ODataFilterHelper
    {
        /// <summary>
        /// Escapes single quotes so a raw user input is safe to embed inside an OData string literal
        /// </summary>
        public static string EscapeODataStringLiteral(string value)
        {
            return value.Replace("'", "''");
        }


    }
}
