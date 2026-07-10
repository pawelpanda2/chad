using System;
using System.Collections.Generic;
using System.IO;

namespace SharpFileServiceProg.AAPublic;

public interface IParentVisit
{
    public List<DirectoryInfo> Parents { get; }

    public void Visit(
        string path,
        Action<FileInfo> fileAction,
        Action<DirectoryInfo> directoryAction);
}