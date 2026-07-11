using SharpFileServiceProg.AAPublic;

namespace SharpFileServiceProg.Yaml;

internal class YamlWorker : IYamlWrk
{
    public IYamlOperations Dotnet { get; }
    public IYamlOperations Sharp { get; }
    public IYamlOperations Byjson { get; }
    public IYamlOperations Custom01 { get; }
    public IYamlOperations Custom02 { get; }
    public IYamlOperations Custom03 { get; }
    public IYamlDefaultOperations Default { get; }

    public YamlWorker()
    {
        Dotnet = new DotnetYamlOperations();
        Sharp = new SharpYamlOperations();
        Byjson = new ByJsonYamlOperations();
        Custom01 = new Custom01YamlOperations();
        Custom02 = new Custom02YamlOperations();
        Custom03 = new Custom03YamlOperations();
    }
}