using System.Xml;
using System.Xml.Linq;
using SharpOperationsProg.AAPublic;
using SharpOperationsProg.AAPublic.Operations;

namespace SharpOperationsProg.Operations.Xml;

public class XmlWorker
{
    private readonly AppendNotepadWorkspace appendNotepadWorkspace;

    public XmlWorker(IOperationsService operationsService)
    {
        this.appendNotepadWorkspace = new AppendNotepadWorkspace();
    }

    public void Load(string path)
    {
        var text = File.ReadAllText(path);
        XmlDocument doc = new XmlDocument();
            
        using (FileStream fs = File.OpenRead(path))
        {
            doc.Load(fs);
        }

        var gg = doc.GetElementsByTagName("File").Cast<XmlNode>().Where(x => x.Attributes[0].Value.Contains("index.php")).ToList();
        gg.ForEach(x => x.ParentNode.RemoveChild(x));

        var gg2 = doc.GetElementsByTagName("File").Cast<XmlNode>().Where(x => x.Attributes[0].Value.Contains("nazwa.txt")).ToList();

        var path2 = System.IO.Path.GetDirectoryName(path);
        var gg3 = gg2.Select(x => GetName(x, path2)).ToList();

        gg3.ForEach(x => ChangeName(x));

        //gg2.Select(x => (x, File.ReadAllLines(path).First();
        //gg.ForEach(x => x.ParentNode.RemoveChild(x));

        using (FileStream fs = File.OpenWrite(path))
        {
            doc.Save(fs);
        }
    }

    public XmlDocument CreateNotepadWorkspaceNode(List<string> pathsList)
    {
        var notepadPlusElement = new XElement("NotepadPlus");
        foreach (string path in pathsList)
        {
            var projectElement = appendNotepadWorkspace.Do(path);
            notepadPlusElement.Add(projectElement);
        } 

        var xmlDocument = ToXmlNode(notepadPlusElement);
        return xmlDocument;
    }

    private void AppendFilesAndFolders(XElement element, string path)
    {

    }

    private XmlDocument ToXmlNode(XElement element)
    {
        using (XmlReader xmlReader = element.CreateReader())
        {
            XmlDocument xmlDoc = new XmlDocument();
            xmlDoc.Load(xmlReader);
            return xmlDoc;
        }
    }

    private (XmlNode, string) GetName(XmlNode node, string path)
    {
        var path2 = System.IO.Path.Combine(path, node.Attributes[0].Value);
        var name = File.ReadAllLines(path2).First();

        return (node, name);
    }

    private void ChangeName((XmlNode, string) input)
    {
        var temp = input.Item2
            .Replace("; ", "_")
            .Replace(";", "_")
            .Replace(" ", "-")
            .Replace(".", "_")
            .Replace(",", "_");
        var number = input.Item1.ParentNode.Attributes[0].Value.Substring(0, 2);
        var sum = number + "_" + temp;
        input.Item1.ParentNode.Attributes[0].Value = sum;
    }
}