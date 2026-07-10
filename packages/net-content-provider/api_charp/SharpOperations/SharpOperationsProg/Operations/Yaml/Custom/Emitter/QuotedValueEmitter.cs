using YamlDotNet.Core;
using YamlDotNet.Core.Events;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.EventEmitters;

namespace SharpOperationsProg.Operations.Yaml.Custom.Emitter;

public class QuotedValueEmitter : ChainedEventEmitter
{
    public QuotedValueEmitter(IEventEmitter nextEmitter) : base(nextEmitter) { }

    public override void Emit(ScalarEventInfo eventInfo, IEmitter emitter)
    {
        if (eventInfo.Source.Type == typeof(string))
        {
            var tmp = eventInfo.Style;
            var scalar = new Scalar(
                eventInfo.Anchor,
                eventInfo.Tag,
                eventInfo.RenderedValue,
                ScalarStyle.DoubleQuoted,
                eventInfo.IsPlainImplicit,
                eventInfo.IsQuotedImplicit
            );

            emitter.Emit(scalar);
        }
        else
        {
            base.Emit(eventInfo, emitter);
        }
    }
}