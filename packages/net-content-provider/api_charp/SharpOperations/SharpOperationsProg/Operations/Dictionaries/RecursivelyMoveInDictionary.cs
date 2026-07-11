namespace SharpOperationsProg.Operations.Dictionaries;

public class RecursivelyMoveInDictionaries
{
    private Action<Dictionary<object, object>, object> itemAction;

    private readonly Dictionary<string, int> keyQlevelDict;

    List<Dictionary<object, object>> parentStack;

    private List<Action> actionsList;

    public RecursivelyMoveInDictionaries(Dictionary<string, int> keyQlevelDict)
    {
        parentStack = new List<Dictionary<object, object>>();
        actionsList = new List<Action>();
        this.keyQlevelDict = keyQlevelDict;
        itemAction = GetAction();
    }

    public Action<Dictionary<object, object>, object> GetAction()
    {
        return (parent, key) =>
        {
            if (keyQlevelDict.TryGetValue(key.ToString(), out var level))
            {
                var index = parentStack.Count - 1 - level;
                if (index < 0){
                    index = 0;
                }

                var newParent = parentStack.ElementAt(index);
                var value = parent[key];
                var action = new Action(() =>
                {
                    parent.Remove(key);
                    newParent.Add(key, value);
                });
                actionsList.Add(action);
            }
        };
    }

    public void Finalize()
    {
        actionsList.ForEach(x => x.Invoke());
    }

    public void Visit(Dictionary<object, object> dict)
    {
        if (dict == null)
        {
            throw new Exception();
        }

        parentStack.Add(dict);
        foreach (var kv in dict)
        {
            itemAction.Invoke(dict, kv.Key);

            if (kv.Value is Dictionary<object, object> dict2)
            {
                Visit(dict2);
            }

            if (kv.Value is List<object> list)
            {
                VisitList(list);
            }
        }
        parentStack.Remove(dict);

        if (parentStack.Count == 0)
        {
            Finalize();
        }
    }

    public void VisitList(List<object> list)
    {
        foreach (var elem in list)
        {
            if (elem is Dictionary<object, object> dict)
            {
                Visit(dict);
            }
        }
    }
}