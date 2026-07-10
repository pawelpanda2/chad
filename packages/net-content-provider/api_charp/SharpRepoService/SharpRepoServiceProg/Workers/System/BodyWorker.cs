using System.Collections.Generic;
using System.IO;
using System.Linq;
using SharpRepoServiceProg.Registrations;

namespace SharpRepoServiceProg.Workers.System;

internal class BodyWorker
{
    private char _newLine = '\n';
    private PathWorker _path;

    public BodyWorker()
    {
        _path = MyBorder.MyContainer.Resolve<PathWorker>();
    }

    public void CreateBody(
        (string Repo, string Loca) adrTuple,
        string content)
    {
        var filePath = _path.GetBodyPath(adrTuple);
        File.WriteAllText(filePath, content);
    }

    private void OverrideTextGenerate(
        (string Repo, string Loca) adrTuple,
        string newContent)
    {
        var contentFilePath = _path.GetBodyPath(adrTuple);
        File.WriteAllText(contentFilePath, newContent);
    }

    private void AppendTextTopGenerate(
        (string Repo, string Loca) adrTuple,
        string content)
    {
        var contentFilePath = _path.GetBodyPath(adrTuple);
        var oldContent = GetBody(adrTuple);
        var newContent = oldContent + _newLine + content;
        File.WriteAllText(contentFilePath, newContent);
    }

    public List<string> GetTextLines(
        (string Repo, string Loca) adrTuple)
    {
        var path = _path.GetBodyPath(adrTuple);
        var lines = File.ReadAllLines(path).ToList();
        return lines;
    }
    
    public string GetBody(
        (string Repo, string Loca) adrTuple)
    {
        string path = _path.GetBodyPath(adrTuple);
        string[] lines = File.ReadAllLines(path);
        string content = string.Join(_newLine, lines);
        return content;
    }
    
    // public string GetText3(
    //     (string Repo, string Loca) adrTuple)
    // {
    //     var path = pw.GetBodyPath(adrTuple);
    //     //var lines = File.ReadAllLines(path).Skip(4);
    //     var lines = File.ReadAllLines(path);
    //     var content = string.Join(newLine, lines);
    //     return content;
    // }
}
