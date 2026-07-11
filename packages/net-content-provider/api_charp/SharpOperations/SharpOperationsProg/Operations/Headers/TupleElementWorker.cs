namespace SharpOperationsProg.Operations.Headers;

public class TupleElementWorker
{
    public List<(string Type, int Level, string Text)> GetElements(
        string inputText)
    {
        var lines = inputText.Split("\n");
        var result = GetElements(lines);
        return result;
    }


    public List<(string Type, int Level, string Text)> GetElements(
        string[] lines)
    {
        var elements = new List<(string, int, string)>();

        for (int i = 0; i < lines.Length; i++)
        {
            //i = 4;
            var line = lines[i];
            if (IsHeader(line))
            {
                var elem = (ElementType.Header.ToString(), GetHeaderLevel(line), GetHeaderText(line)); ;
                elements.Add(elem);
            }
            else
            {
                var elem = (ElementType.Line.ToString(), GetLineLevel(line), GetLineText(line));
                elements.Add(elem);
            }
        }

        return elements;
    }

    public List<(string type, int level, string text)> GetElements2(
        string[] lines)
    {
        var elements = new List<(string, int, string)>();

        for (int i = 0; i < lines.Length; i++)
        {
            //i = 4;
            var line = lines[i];
            if (IsHeader(line))
            {
                var elem = (ElementType.Header.ToString(), GetHeaderLevel(line), GetHeaderText(line));
                elements.Add(elem);
            }
            else
            {
                var elem = (ElementType.Line.ToString(), GetLineLevel(line), GetLineText(line));
                elements.Add(elem);
            }
        }

        return elements;
    }

    private string GetLineText(string line)
    {
        var text = line.TrimStart();
        return text;
    }

    private int GetLineLevel(string line)
    {
        var lvl = 1;
        char c1 = default;
        char c2 = default;
        var i = 0;

        for (i = 0; i < line.Length; i++)
        {
            c1 = line[i];
            if (i != line.Length - 1) { c2 = line[i]; }

            if (c1 == '/' && c2 == '/')
            {
                throw new Exception();
            }

            if (c1 != '\t')
            {
                break;
            }

            lvl++;
        }

        return lvl;
    }

    private string GetHeaderText(string line)
    {
        var parts = line.TrimStart().Split("//");
        var text = parts[1];
        return text;
    }

    private int GetHeaderLevel(string line)
    {
        var lvl = 2;
        char c1 = default;
        char c2 = default;
        var i = 0;

        if (line.Length < 2)
        {
            throw new Exception();
        }

        for (i = 0; i < line.Length; i++)
        {
            c1 = line[i];
            if (i != line.Length - 1) { c2 = line[i]; }

            if (c1 != '\t')
            {
                break;
            }
                
            lvl++;
        }

        if ((line.Length - 1) < i + 1)
        {
            throw new Exception();
        }

        if (c1 != '/' || c2 != '/')
        {
            throw new Exception();
        }

        return lvl;
    }

    private bool IsLine()
    {
        throw new NotImplementedException();
    }

    private bool IsHeader(string line)
    {
        int i = 0;
        char c1 = default;
        char c2 = default;

        for (i = 0; i < line.Length; i++)
        {
            c1 = line[i];

            if (c1 != '\t')
            {
                break;
            }
        }

        if ((line.Length - 1) < i + 1)
        {
            return false;
        }

        c2 = line[i + 1];

        if (c1 == '/' && c2 == '/')
        {
            return true;
        }

        return false;
    }
}