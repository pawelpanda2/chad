namespace SharpOperationsProg.Operations.Conversations;

public class ConvOperationsWorker02
{
    private string myAccoutId;

    public List<string> GetConversationForGoogleDoc(
        Dictionary<object, object> dict, string myAccoutId)
    {
        this.myAccoutId = myAccoutId;
        var id = dict["id"].ToString();
        var name = dict["name"].ToString();
        var tmp = dict["messages"] as List<object>;
        var bio = (dict["bio"] ?? "").ToString().Split('\n');
        var birth_date = dict["birth_date"].ToString();
        var messagesObj = tmp.Select(x => (Dictionary<object, object>)x).ToList();
        var messages = messagesObj.Select(x => OwnerName(x) + " " + x["message"].ToString()).ToList();
        var year = BrithDateToYear(birth_date);
        var nameQyear = name + " " + year;

        var output = new List<string>();
        output.Add(string.Empty);
        output.Add("id: " + id);
        output.Add("name: " + nameQyear);
        output.Add("bio:");
        output.AddRange(bio);
        output.Add("messages:");
        output.AddRange(messages);
        output.Add(string.Empty);

        return output;
    }

    public string GetConvName(Dictionary<object, object> dict)
    {
        var id = dict["id"].ToString();
        var name = dict["name"].ToString();
        var birth = dict["birth_date"].ToString();
        var herId = GetHerId(id);
        var year = BrithDateToYear(birth);

        var convName = name + "_" + year + "_" + herId;
        return convName;
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