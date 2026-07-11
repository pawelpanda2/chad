using System;
using System.Collections.Generic;
using System.IO;

namespace SharpRepoServiceProg.Workers.System;

public class RepoPathComparer : IComparer<string>
{
    public int Compare(
        string path01, 
        string path02)
    {
        string repoName01 = Path.GetFileName(path01);
        string repoName02 = Path.GetFileName(path02);
        int result = string.Compare(repoName01, repoName02, StringComparison.Ordinal);
        return result;
    }
}
