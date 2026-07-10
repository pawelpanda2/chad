namespace SharpFileServiceProg.AAPublic;

public interface IFileVisit
{
    public void Visit(
        string path,
        Action<FileInfo> fileAction,
        Action<DirectoryInfo> directoryAction);
}