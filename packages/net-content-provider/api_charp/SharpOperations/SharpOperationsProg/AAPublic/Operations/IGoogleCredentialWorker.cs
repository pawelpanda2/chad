using System.Reflection;

namespace SharpOperationsProg.AAPublic.Operations;

public interface IGoogleCredentialWorker
{
    (string clientId, string clientSecret) GetCredentials(
        AssemblyName assemblyName,
        string embeddedResourceFile);
    (string clientId, string clientSecret) GetCredentials(
        string jsonFileContent);

    string GetEmbeddedResource(AssemblyName assemblyName, string filename);
    Stream GetEmbeddedResourceStream(AssemblyName assemblyName, string filename);
    AssemblyName GetAssemblyName(object obj);
}