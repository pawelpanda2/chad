namespace SharpOperationsProg.Operations.Conversations;

public class ConvOperationsWorker01
{
    //private readonly DateOperations dateOperations;
    private string myAccoutId;
    private string _newLine = Environment.NewLine;

    // Do not change internal!
    internal ConvOperationsWorker01()
    {
    }

    public List<string> GetAllConversationForTextFile(
        List<Dictionary<object, object>> dictList, string myAccoutId)
    {
        var output = new List<string>();
        foreach (var dict in dictList)
        {
            var convTextList = GetConversationForTextFile(dict, myAccoutId);
            output.AddRange(convTextList);
            output.Add(string.Empty);
        }

        return output;
    }
    
    public string GetConversationString(
        Dictionary<object, object> dict,
        string myAccoutId)
    {
        var list = GetConversationForTextFile(dict, myAccoutId);
        var result = string.Join(_newLine, list);
        return result;
    }

    public List<string> GetConversationForTextFile(
        Dictionary<object, object> dict, string myAccoutId)
    {
        this.myAccoutId = myAccoutId;
        var id = dict["id"].ToString();
        var name = dict["name"].ToString();
        var tmp = dict["messages"] as List<object>;
        var bio2 = dict["bio"]; if (bio2 == null) { bio2 = ""; }
        var bio = bio2.ToString().Split(_newLine).ToList();
        bio.RemoveAll(x => x == string.Empty);
        var birth_date = dict["birth_date"].ToString();
        var messagesObj = tmp.Select(x => (Dictionary<object, object>)x).ToList();
        var messages = messagesObj.Select(x => OwnerName(x) + " " + x["message"].ToString()).ToList();
        var year = BrithDateToYear(birth_date);
        var nameQyear = name + " " + year;

        var output = new List<string>();
        output.Add("id: " + id);
        output.Add("name: " + nameQyear);
        output.Add("bio:");
        output.AddRange(bio);
        output.Add("messages:");
        output.AddRange(messages);
        output.Add(string.Empty);

        if (bio.Count() > 0 &&
            bio[0].ToString() == "System.Collections.Generic.List`1[System.String]")
        {}

        return output;
    }

    public string GetConvName(Dictionary<object, object> dict)
    {
        var id = dict["id"].ToString();
        var name = dict["name"].ToString();
        var birth = dict["birth_date"].ToString();
        var herId = GetHerId(id);
        var year = ToYear(birth);

        var convName = name + "_" + year + "_" + herId;
        return convName;
    }
    
    public string ToYear(string dateString)
    {
        var date = DateTime.Parse(dateString);
        var year = date.Year.ToString();
        return year;
    }

    private string OwnerName(object obj)
    {
        var from = (obj as Dictionary<object, object>)["from"].ToString();
        if (from == myAccoutId)
        {
            return "_ja:";
        }

        return "ona:";
    }

    private string BrithDateToYear(string birthDate)
    {
        var date = DateTime.Parse(birthDate);
        var year = date.Year.ToString();
        return year;
    }

    public string GetHerId(string id, string myAccoutId2)
    {
        var id1 = id.Substring(0, 24);
        var id2 = id.Substring(23, 24);

        if (id1 == myAccoutId2)
        {
            return id2;
        }

        return id1;
    }

    private string GetHerId(string id)
    {
        var id1 = id.Substring(0, 24);
        var id2 = id.Substring(23, 24);

        if (id1 == myAccoutId)
        {
            return id2;
        }

        return id1;
    }
}