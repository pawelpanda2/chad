using YamlDotNet.Core;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.ObjectGraphVisitors;

namespace SharpFileServiceProg.Yaml.Custom.ObjectGraphVisitor;

public sealed class CustomSerializationObjectGraphVisitor : ChainedObjectGraphVisitor
{
    #region Fields

    private readonly ObjectSerializer nestedObjectSerializer;
    private readonly IEnumerable<IYamlTypeConverter> typeConverters;

    #endregion Fields

    #region Constructors

    public CustomSerializationObjectGraphVisitor(
        IObjectGraphVisitor<IEmitter> nextVisitor,
        IEnumerable<IYamlTypeConverter> typeConverters,
        ObjectSerializer nestedObjectSerializer)
        : base(nextVisitor)
    {
        this.typeConverters = typeConverters != null
            ? typeConverters.ToList()
            : Enumerable.Empty<IYamlTypeConverter>();

        this.nestedObjectSerializer = nestedObjectSerializer;
    }

    #endregion Constructors

    #region Methods

    public override bool Enter(IObjectDescriptor value, IEmitter context)
    {
        var typeConverter = typeConverters.FirstOrDefault(t => t.Accepts(value.Type));
        if (typeConverter != null)
        {
            typeConverter.WriteYaml(context, value.Value, value.Type);
            return false;
        }

        var convertible = value.Value as IYamlConvertible;
        if (convertible != null)
        {
            convertible.Write(context, nestedObjectSerializer);
            return false;
        }

#pragma warning disable 0618 // IYamlSerializable is obsolete
        var serializable = value.Value as IYamlSerializable;
        if (serializable != null)
        {
            serializable.WriteYaml(context);
            return false;
        }
#pragma warning restore

        return base.Enter(value, context);
    }

    #endregion Methods
}