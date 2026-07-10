namespace TinderImport
{
    internal class Person2
    {
        public string Name { get; private set; }
        public string Id { get; private set; }
        public DateTime BithDate { get; private set; }
        public List<string> PhotoUrls { get; private set; }
        public List<string> Bio { get; private set; }

        public string BlueprintCode { get; private set; }

        public List<string> BlueprintsList => DecodeBlueprintCodes();

        public int Age
        {
            get
            {
                var today = DateTime.Today;
                var age = today.Year - BithDate.Year;
                if (BithDate.Date > today.AddYears(-age)) age--;
                return age;
            }
        }

        public void SetBluePrintCode(string code)
        {
            BlueprintCode = code;
        }

        public Person2(string name,
            DateTime bithDate,
            List<string> photoUrls,
            string id,
            List<string> bio)
        {
            Name = name;
            BithDate = bithDate;
            PhotoUrls = photoUrls;
            Id = id;
            Bio = bio;
        }

        private List<string> DecodeBlueprintCodes()
        {
            var blueprintsList = new List<string>();
            var tempSplit = new List<string>();
            if (BlueprintCode != null && BlueprintCode.Contains('/'))
            {
                tempSplit = BlueprintCode.Split("/").ToList();
            }

            var properties = typeof(Blueprints).GetProperties();
            var propNames = properties.Select(p => p.Name);

            var dict = new Dictionary<string, string>();
            dict.Add("Z", "Zabawa");
            dict.Add("S", "Seks");
            dict.Add("P", "Połączenie");
            dict.Add("A", "Ambicja");
            dict.Add("V", "Walidacja");
            dict.Add("X", "Niewiemy");
            dict.Add("SZC", "Szybki-close");
            dict.Add("?", "Wrócić");

            foreach (var item in tempSplit)
            {
                var keyValue = dict.SingleOrDefault(x => x.Key.ToLower() == item.ToLower());
                //var prop = properties.SingleOrDefault(x => x.Name.ToLower() == item.ToLower());
                
                if (dict != null)
                {
                    var fullName = keyValue.Value;
                    //var fullName = prop.GetValue(null);

                    if (fullName != null)
                    {
                        blueprintsList.Add(fullName.ToString());
                    }
                }
            }

            return blueprintsList;
        }
    }
}