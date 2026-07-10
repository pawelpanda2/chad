namespace SharpOperationsProg.Operations.Headers;

public class HeadersOperationsConversion
{
    public List<(string Type, int Level, object Value)> ToLinesList(
        List<(string Type, int Level, string Text)> elementsList)
    {
        var previousElem = elementsList.First();
        previousElem = default;

        var resultList = new List<(string Type, int Level, object Value)>();

        foreach (var elem in elementsList)
        {
            if (elem.Type == ElementType.Header.ToString())
            {
                resultList.Add((ElementType.Header.ToString(), elem.Level, elem.Text));
            }

            if (elem.Type == ElementType.Line.ToString() &&
                elem == elementsList.First())
            {
                previousElem = elem;
                var lines = new List<string> { elem.Text };
                resultList.Add((ElementType.LinesList.ToString(), elem.Level, lines));
                continue;
            }

            if (elem.Type == ElementType.Line.ToString())
            {
                if (previousElem.Type == ElementType.Header.ToString())
                {
                    var lines = new List<string> { elem.Text };
                    resultList.Add((ElementType.LinesList.ToString(), elem.Level, lines));
                }
                else
                {
                    var tmp = resultList.Last().Value;
                    if (resultList.Last().Value is List<string> tmp2)
                    {
                        tmp2.Add(elem.Text);
                    }
                    else
                    {
                        throw new Exception();
                    }
                }
            }

            previousElem = elem;
        }

        return resultList;
    }

    public void NumberOneEverywhere(
        List<(string Type, int Level, string Text)> elementsList)
    {
        for (int i = 0; i < elementsList.Count; i++)
        {
            var item = elementsList[i];
            elementsList[i] = (item.Type, item.Level, "1");
        }
    }

    public List<(string Type, int Level, object Value)> Convert2(
        List<(string Type, int Level, string Text)> elementsList)
    {
        var previousElem = elementsList.First();
        previousElem = default;

        var resultList = new List<(string Type, int Level, object Value)>();

        foreach (var elem in elementsList)
        {
            if (elem.Type == ElementType.Header.ToString())
            {
                resultList.Add((ElementType.Header.ToString(), elem.Level, "1"));
            }

            if (elem.Type == ElementType.Line.ToString() & previousElem.Type == ElementType.Header.ToString())
            {
                var lines = new List<string> { "1" };
                resultList.Add((ElementType.LinesList.ToString(), elem.Level, lines));
            }

            if (elem.Type == ElementType.Line.ToString() & previousElem.Type != ElementType.Header.ToString())
            {
                var tmp = resultList.Last().Value as List<string>;
                tmp.Add("1");
            }

            previousElem = elem;
        }

        return resultList;
    }
}