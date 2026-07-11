namespace TinderImport
{
    using YamlDotNetSerializer = YamlDotNet.Serialization.Serializer;
    using SharpYamlSerializer = SharpYaml.Serialization.Serializer;
    using Newtonsoft.Json;

    internal class YamlWorker
    {
        private YamlDotNetSerializer yamlSerializerDotNet;
        private SharpYamlSerializer yamlSerializerSharp;

        public YamlWorker()
        {
            yamlSerializerDotNet = new YamlDotNetSerializer();
            yamlSerializerSharp = new SharpYamlSerializer();
        }

        public string Serialize(object input)
        {
            var result = yamlSerializerDotNet.Serialize(input);
            return result;
        }

        public object Deserialize(string path)
        {
            var yamlText = File.ReadAllText(path);
            var result = yamlSerializerSharp.Deserialize<object>(yamlText);
            return result;
        }

        public T Deserialize<T>(string path)
        {
            var yamlText = File.ReadAllText(path);
            try
            {
                var result = yamlSerializerSharp.Deserialize<T>(yamlText);
                return result;
            }
            catch (Exception ex)
            {
                //throw ex;
            }
            
            return default;
        }

        public T DeserializeYamlByJson<T>(string filePath)
        {
            var yamlText = Deserialize(filePath);
            var w = new StringWriter();
            var js = new JsonSerializer();
            js.Serialize(w, yamlText);
            string jsonText = w.ToString();
            try
            {
                var jObj = JsonConvert.DeserializeObject<T>(jsonText);
                return jObj;
            }
            catch (Exception ex)
            {
                //throw ex;
            }

            return default;
        }
    }
}
