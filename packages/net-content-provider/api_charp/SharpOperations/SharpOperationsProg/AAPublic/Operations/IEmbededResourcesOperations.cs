using System.Reflection;

namespace SharpOperationsProg.AAPublic.Operations;

public interface IEmbeddedResourcesOperations
{
    public static string GetEmbeddedResource(
        AssemblyName assemblyName,
        string filename)
    {
        string? namespacename = assemblyName.Name;
        string resourceName = namespacename + "." + filename;
        Assembly assembly = Assembly.Load(assemblyName);

        using (Stream stream = assembly.GetManifestResourceStream(resourceName))
        {
            if (stream == null)
            {
                throw new Exception("File stream is null. Check assembly file path.");
            }

            using (StreamReader reader = new StreamReader(stream))
            {
                string result = reader.ReadToEnd();
                return result;
            }
        }
    }

    public static Stream GetEmbeddedResourceStream(
        object obj,
        string filename)
    {
        AssemblyName assemblyName = GetAssemblyName(obj);
        Stream stream = GetEmbeddedResourceStream(assemblyName, filename);
        return stream;
    }
    
    public static AssemblyName GetAssemblyName(object obj)
    {
        Assembly? assembly = Assembly.GetAssembly(obj.GetType());
        AssemblyName assebmlyName = assembly.GetName();
        return assebmlyName;
    }

    public static Stream GetEmbeddedResourceStream(
        AssemblyName assemblyName,
        string filename)
    {
        string? namespacename = assemblyName.Name;
        string resourceName = namespacename + "." + filename;
        Assembly assembly = Assembly.Load(assemblyName);

        Stream? stream = assembly.GetManifestResourceStream(resourceName);

        if (stream == null)
        {
            throw new Exception("File stream is null. Check assembly file path.");
        }

        StreamReader reader = new(stream);
        return stream;
    }
}