namespace SharpOperationsProg.Operations.Dictionaries;

public class RecursivelyLeaveOnlyInDictionaries
{
    private Action<Dictionary<object, object>, string> otherAction;

    private readonly List<string> _keysToLeft;

    public RecursivelyLeaveOnlyInDictionaries(
        List<string> keysToLeft)
    {
        _keysToLeft = keysToLeft;
        otherAction = (parent, key) =>
        {
            if (!keysToLeft.Any(x => x == key))
            {
                parent.Remove(key);
            }
        };
    }

    public void Visit(
        Dictionary<object, object> dict)
    {
        if (dict == null)
        {
            throw new Exception();
        }

        foreach (var kv in dict)
        {
            if (kv.Value is Dictionary<object, object> dict2)
            {
                Visit(dict2);
            }

            if (kv.Value is List<object> list)
            {
                VisitList(list);
            }

            otherAction.Invoke(dict, kv.Key.ToString());
        }
    }

    public void VisitList(
        List<object> list)
    {
        foreach (var elem in list)
        {
            if (elem is Dictionary<object, object> dict2)
            {
                Visit(dict2);
            }
        }
    }
}
