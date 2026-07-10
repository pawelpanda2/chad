using System.Collections;
using YamlDotNet.Core;
using YamlDotNet.Core.Events;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.ObjectFactories;

namespace SharpOperationsProg.Operations.Yaml;

public sealed class ForceEmptyListsOnDeserialization : INodeDeserializer
{
    private readonly IObjectFactory objectFactory = new DefaultObjectFactory();

    private string previous;

    public bool Deserialize(
        IParser parser,
        Type expectedType,
        Func<IParser, Type, object> nestedObjectDeserializer,
        out object value)
    {
        var current = parser.Current;
        value = null;
        var gg = false;
        if (gg)
        {
            expectedType = typeof(List<string>);
            value = new List<string>();
        }
        return false;
    }

    //var gg = parser.Current;
    //var gg2 = parser.Accept<NodeEvent>(out var evt);
    //if (NodeIsNull(evt))
    //{
    //    parser.SkipThisAndNestedEvents();
    //    value = objectFactory.Create(expectedType);
    //    return true;
    //}

    //if (IsList(expectedType) && parser.Accept<NodeEvent>(out var evt2))
    //{
    //    if (NodeIsNull(evt2))
    //    {
    //        parser.SkipThisAndNestedEvents();
    //        value = objectFactory.Create(expectedType);
    //        return true;
    //    }
    //}

    private bool NodeIsNull(NodeEvent nodeEvent)
    {
        // http://yaml.org/type/null.html

        if (nodeEvent.Tag == "tag:yaml.org,2002:null")
        {
            return true;
        }

        if (nodeEvent is Scalar scalar && scalar.Style == ScalarStyle.Plain)
        {
            var value = scalar.Value;
            var isNull = value == "" || value == "~" || value == "null" || value == "Null" || value == "NULL";
            return isNull;
        }

        return false;
    }

    private bool IsList(Type type)
    {
        return typeof(IList).IsAssignableFrom(type)
               || type.IsInterface && type.IsGenericType && type.GetGenericTypeDefinition() == typeof(IList<>)
               || type.GetInterfaces().Any(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IList<>));
    }
}