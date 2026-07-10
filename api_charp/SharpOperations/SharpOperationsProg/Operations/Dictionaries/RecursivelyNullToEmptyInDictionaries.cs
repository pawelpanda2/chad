namespace SharpOperationsProg.Operations.Dictionaries;

public class RecursivelyNullToDefaultInDictionaries
{
    private Action<Dictionary<object, object>, string> otherAction;

    private readonly List<(string, object)> keysToLeft;

    public RecursivelyNullToDefaultInDictionaries(List<(string, object)> keysToLeft)
    {
        this.keysToLeft = keysToLeft;
        otherAction = (parent, key) =>
        {
            var value = parent[key];
            var found = keysToLeft.SingleOrDefault(x => x.Item1 == key);
            if (found != default &&
                value == null)
            {
                var newValue = DeepClone(found.Item2);
                parent[key] = newValue;
            }
        };
    }

    public void Visit(Dictionary<object, object> dict)
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

    public void VisitList(List<object> list)
    {
        foreach (var elem in list)
        {
            if (elem is Dictionary<object, object> dict2)
            {
                Visit(dict2);
            }
        }
    }

    private T DeepClone<T>(T a)
    {
        using (MemoryStream stream = new MemoryStream())
        {
            //BinaryFormatter formatter = new BinaryFormatter();
            //formatter.Serialize(stream, a);
            //stream.Position = 0;
            //return (T)formatter.Deserialize(stream);
            return default;
        }
    }
}