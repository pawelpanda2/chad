using YamlDotNet.Core;
using YamlDotNet.Core.Events;
using YamlDotNet.Serialization;

namespace SharpFileServiceProg.Yaml.Custom.TypeConverter;

public class QuotedValueConverter : IYamlTypeConverter
{
    public bool Accepts(Type type)
    {
        return true;
    }

    public object ReadYaml(IParser parser, Type type)
    {
        return null;
    }

    public void WriteYaml(IEmitter emitter, object value, Type type)
    {
        if (value != null)
        {
            emitter.Emit(new Scalar(null, null, value.ToString(), ScalarStyle.DoubleQuoted, true, false));
        }
    }
}