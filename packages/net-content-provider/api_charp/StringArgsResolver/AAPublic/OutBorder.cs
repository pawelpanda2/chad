using SharpApiArgsProg.Services;

namespace SharpApiArgsProg.AAPublic;

public class OutBorder
{
    public static IStringArgsResolverService StringArgsResolverService(
        List<object> servicesList)
    {
        StringArgsResolverService resolverService = new(servicesList);
        return resolverService;
    }
}
