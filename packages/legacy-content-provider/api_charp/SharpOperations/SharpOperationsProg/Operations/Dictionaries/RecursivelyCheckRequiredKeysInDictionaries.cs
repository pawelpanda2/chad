namespace SharpOperationsProg.Operations.Dictionaries;

public class RecursivelyCheckRequiredKeysInDictionaries
{
    private Action<Dictionary<object, object>, object> itemAction;

    private readonly List<(string, string)> parentQchildList;

    List<object> parentStack;

    private List<Action> actionsList;
    private List<(Dictionary<object, object>, Dictionary<object, object>, object, List<object>)> actionsList2;
    private bool first = true;

    public RecursivelyCheckRequiredKeysInDictionaries(List<(string, string)> parentQchildList)
    {
        parentStack = new List<object>();
        actionsList = new();
        actionsList2 = new();
        this.parentQchildList = parentQchildList;
    }

    public void ItemAction(string name, Dictionary<object, object> dict)
    {
        var parentQchildRule = parentQchildList.Where(x => x.Item1 == name).ToList();

        foreach (var parentQchild in parentQchildRule)
        {
            var find = dict.TryGetValue(parentQchild.Item2, out var value);
            if (!find)
            {
                HandleError();
            }
            if (value == null)
            {
                //HandleError();
            }
        }
    }

    private void HandleError()
    {
        throw new Exception();
    }

    public void Visit(Dictionary<object, object> dict)
    {
        if (dict == null)
        {
            throw new Exception();
        }

        if (first == true)
        {
            ItemAction("root", dict);
            first = false;
        }

        foreach (var kv in dict)
        {
            ItemAction(kv.Key.ToString(), dict);

            if (kv.Value is Dictionary<object, object> dict2)
            {
                Visit(dict2);
            }

            if (kv.Value is List<object> list)
            {
                VisitList(list);
            }
        }
    }

    public void VisitList(List<object> list)
    {
        foreach (var elem in list)
        {
            if (elem is Dictionary<object, object> dict)
            {
                parentStack.Add(list);
                Visit(dict);
                parentStack.Remove(list);
            }
        }
    }
}