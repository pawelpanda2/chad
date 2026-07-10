using YamlDotNet.Core;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.EventEmitters;

namespace SharpFileServiceProg.Yaml.Custom.Emitter;

public class QuotedScalarEventEmitter : ChainedEventEmitter
{
    public QuotedScalarEventEmitter(IEventEmitter nextEmitter) : base(nextEmitter) { }

    public override void Emit(ScalarEventInfo eventInfo, IEmitter emitter)
    {
        if (eventInfo.Source.Type == typeof(string)) // !eventInfo.Style.HasValue
        {
            eventInfo.Style = ScalarStyle.DoubleQuoted;
        }

        base.Emit(eventInfo, emitter);
    }
}