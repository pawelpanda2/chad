using SharpFileServiceProg.Workers;

namespace SharpFileServiceProg.AAPublic;

public interface IFileService
{
    IYamlWrk Yaml { get; }
        
    IFileWrk File { get; }
}