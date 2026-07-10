using System.IO;
using System.Linq;
using SharpRepoServiceProg.Registrations;

namespace SharpRepoServiceProg.Workers.System;

internal class SystemWorker
{
    private PathWorker pw;

    public char NewLine => '\n';

    public SystemWorker()
    {
        pw = MyBorder.MyContainer.Resolve<PathWorker>();
    }

    public void CreateDirectoryIfNotExists(
        (string Repo, string Loca) adrTuple)
    {
        var path = pw.GetItemPath(adrTuple);

        if (!Directory.Exists(path))
        {
            Directory.CreateDirectory(path);
        }
    }

    public void CreateDirectoryIfNotExists(string path)
    {
        if (!Directory.Exists(path))
        {
            Directory.CreateDirectory(path);
        }
    }

    public string[] GetDirectories(string path)
    {
        var result = Directory.GetDirectories(path);
        return result;
    }

    public string[] GetDirectories(
        (string Repo, string Loca) adrTuple)
    {
        string path = pw.GetItemPath(adrTuple);
        string[] result = Directory.GetDirectories(path);
        string[] withoutSpecial = result
            .Where(x => !SpecialFolders.Contains(Path.GetFileName(x)))
            .ToArray();
        return withoutSpecial;
    }

    public string[] SpecialFolders = [".git"];
}