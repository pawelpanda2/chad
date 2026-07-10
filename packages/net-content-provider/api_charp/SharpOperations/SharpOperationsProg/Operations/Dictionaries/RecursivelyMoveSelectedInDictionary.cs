namespace SharpOperationsProg.Operations.Dictionaries;

public class RecursivelyMoveSelectedInDictionaries
{
    private Action<Dictionary<object, object>, object> itemAction;

    private readonly List<(string, string, int)> pKeyQcKeyQlevelList;

    List<object> parentStack;

    private List<Action> actionsList;
    private List<(Dictionary<object, object>, Dictionary<object, object>, object, List<object>)> actionsList2;

    public RecursivelyMoveSelectedInDictionaries(List<(string, string, int)> keyQlevelDict)
    {
        parentStack = new List<object>();
        actionsList = new();
        actionsList2 = new();
        pKeyQcKeyQlevelList = keyQlevelDict;
    }

    public void ItemAction2(object obj)
    {
        var pKeycKeylevel = pKeyQcKeyQlevelList.SingleOrDefault(x => x.Item1 == obj.ToString());
        if (pKeycKeylevel != default)
        {
            var parentKey = pKeycKeylevel.Item1;
            var childKey = pKeycKeylevel.Item2;
            var level = pKeycKeylevel.Item3;

            var parentOfParent = parentStack.ElementAt(parentStack.Count - 1) as Dictionary<object, object>;
            var parent = parentOfParent[parentKey];
            var newParent = parentStack.ElementAt(parentStack.Count - level) as Dictionary<object, object>;

            if (parent is List<object> parent2)
            {
                var parent3 = parent2.Select(x => (Dictionary<object, object>)x).ToList();
                var selected = parent3.Select(x => x[childKey]).ToList();
                var action = new Action(() =>
                {
                    parent3.ForEach(x => x.Remove(childKey));
                    newParent.Add(childKey, selected);
                });
                actionsList.Add(action);
            }
        }
    }

    public void Finalize()
    {
        actionsList.ForEach(x => x.Invoke());
    }

    public void Visit(Dictionary<object, object> dict)
    {
        if (dict == null)
        {
            return;
        }

        parentStack.Add(dict);
        foreach (var kv in dict)
        {
            ItemAction2(kv.Key);

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
                parentStack.Add(list);
                Visit(dict);
                parentStack.Remove(list);
            }
        }
    }
}