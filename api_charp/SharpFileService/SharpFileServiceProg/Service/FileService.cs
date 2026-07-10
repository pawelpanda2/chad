using SharpFileServiceProg.AAPublic;
using SharpFileServiceProg.Workers;
using SharpFileServiceProg.Yaml;

namespace SharpFileServiceProg.Service;

public class FileService : IFileService
{
    public IYamlWrk Yaml { get;}
    public IFileWrk File { get; }
    
    public FileService()
    {
        Yaml = new YamlWorker();
        File = new FileWrk();
    }
}