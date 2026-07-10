namespace SharpOperationsProg.Operations.Conversations;

public class ConvOperationsWorker03
{
    private string myAccoutId;

    public int CountHerMessages(
        Dictionary<object, object> dict,
        string myAccoutId)
    {
        this.myAccoutId = myAccoutId;
        var tmp = dict["messages"] as List<object>;
        var messagesObj = tmp.Select(x => (Dictionary<object, object>)x).ToList();
        var count = messagesObj.Count(x => IsSheMessageOwener(x) == true);
        //var messages = messagesObj.Select(x => OwnerName(x) + " " + x["message"].ToString()).ToList();

        return count;
    }

    private bool IsSheMessageOwener(object obj)
    {
        var from = (obj as Dictionary<object, object>)["from"].ToString();
        if (from == myAccoutId)
        {
            return false;
        }

        return true;
    }
}