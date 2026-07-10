using SharpFileServiceProg.Service;
using OutBorder1 = SharpFileServiceProg.AAPublic.OutBorder;

namespace SharpFileServiceTests
{
    [TestClass]
    public class UnitTest2
    {
        private readonly IFileService fileService;
        private readonly IFileService.IYamlOperations yamlSharp;
        private readonly IFileService.IYamlOperations yamlCustom01;
        private readonly IFileService.IYamlOperations yamlCustom02;
        private readonly IFileService.IYamlOperations yamlCustom03;
        private readonly IFileService.IYamlOperations yamlByJson;

        public UnitTest2()
        {
            fileService = OutBorder1.FileService();
            yamlSharp = fileService.Yaml.Sharp;
            yamlCustom01 = fileService.Yaml.Custom01;
            yamlCustom02 = fileService.Yaml.Custom02;
            yamlCustom03 = fileService.Yaml.Custom03;
            yamlByJson = fileService.Yaml.Byjson;
        }

        [TestMethod]
        public void TestMethod1()
        {
            // arrange
            var yaml01 = GetYaml01();
            
            var obj = yamlSharp.Deserialize<Dictionary<object, object>>(yaml01);
            var obj2 = yamlCustom01.Deserialize<Dictionary<object, object>>(yaml01);
            //var obj3 = yamlByJson.Deserialize<Dictionary<object, object>>(yaml01);

            var gg = "D:/01_Synchronized/01_Programming_Files/8c0f7763-7149-4b4d-9d6a-b28d3984552f/02_appData/01/03/06/58/lista.txt";
            var gg2 = string.Join("\n", File.ReadAllLines(gg));
            var gg3 = yamlCustom01.Deserialize<Dictionary<object, object>>(gg2);
        }

        [TestMethod]
        public void TestMethod2()
        {
            // arrange
            var yaml02 = GetYaml02();
            var obj1 = yamlSharp.Deserialize<Dictionary<object, object>>(yaml02);
            var obj2 = yamlCustom01.Deserialize<Dictionary<object, object>>(yaml02);
            //var obj3 = yamlByJson.Deserialize<Dictionary<object, object>>(yaml02);
        }

        [TestMethod]
        public void TestMethod3()
        {
            var yaml01 = "name: 'dzikaNazwa'";
            var yaml02 = "name: \"dzikaNazwa\"";
            var yaml03 = "name: dzikaNazwa";

            var dict01 = new Dictionary<string, object> { { "name", "dzika'\"Nazwa" } };

            // act
            var sharpS1 = yamlSharp.TryDeserialize<Dictionary<string, object>>(yaml01, out var sharpOut01);
            var sharpS2 = yamlSharp.TryDeserialize<Dictionary<string, object>>(yaml02, out var sharpOut02);
            var sharpS3 = yamlSharp.TryDeserialize<Dictionary<string, object>>(yaml03, out var sharpOut03);

            var custom01S1 = yamlCustom01.TryDeserialize<Dictionary<string, object>>(yaml01, out var custom01Out01);
            var custom01S2 = yamlCustom01.TryDeserialize<Dictionary<string, object>>(yaml02, out var custom01Out02);
            var custom01S3 = yamlCustom01.TryDeserialize<Dictionary<string, object>>(yaml03, out var custom01Out03);

            var sharpIn = yamlSharp.Serialize(dict01);
            var custom01In = yamlCustom01.Serialize(dict01);
            var custom02In = yamlCustom02.Serialize(dict01);
            var custom03In = yamlCustom03.Serialize(dict01);
        }

        [TestMethod]
        public void Bug_BioWithEmptyLine()
        {
            // arrange
            var yaml01 = GetYaml03();

            // act
            var obj1 = yamlCustom01.Deserialize<Dictionary<object, object>>(yaml01);
            try
            {
                var obj2 = yamlSharp.Deserialize<Dictionary<object, object>>(yaml01);
            }
            catch { }
        }

        public string GetYaml02()
        {
            var id = "600eaa77413de801005301a9";
            string yamlString =
            $$"""
            person:
            _id: 5b890a024e5a87af7be2e268
            bio: 
            birth_date: 1999-02-25T22:53:01.5710000+01:00
            gender: 1
            name: Kasia
            """;
            return yamlString;
        }

        public string GetYaml04()
        {
            var id = "600eaa77413de801005301a9";
            string yamlString =
            $$"""
            person:
              _id: 600eaa77413de801005301a9
              bio: >-
              Będę oglądać z Tobą mecze i pić piwo. Specjalnie dla Ciebie mogę zrobić unfollow na Make Life Harder żebyś mógł mi wysyłać stamtąd memy i będziemy śmiać się razem.
              
              Chętnie będę miała z Tobą psa i będziemy się rano spychać z łóżka kto idzie z nim na spacer. Jak będziesz miał zły dzień przywiozę Ci maka a jak będziesz chory ugotuję rosół. Nie bądź dupkiem a będę o Ciebie dbać i będziemy szczęśliwi XD
              Jak coś to poznaliśmy się w bibliotece 😉
              birth_date: 1999-12-26T21:54:12.5060000+01:00
              gender: 1
              name: Jula
            """;
            return yamlString;
        }

        public string GetYaml01()
        {
            var id = "600eaa77413de801005301a9";
            string yamlString =
            $$"""
            person:
              _id: {{id}}
              bio: >-
                Będę oglądać z Tobą mecze i pić piwo. Specjalnie dla Ciebie mogę zrobić unfollow na Make Life Harder żebyś mógł mi wysyłać stamtąd memy i będziemy śmiać się razem.

                Chętnie będę miała z Tobą psa i będziemy się rano spychać z łóżka kto idzie z nim na spacer. Jak będziesz miał zły dzień przywiozę Ci maka a jak będziesz chory ugotuję rosół. Nie bądź dupkiem a będę o Ciebie dbać i będziemy szczęśliwi XD
                Jak coś to poznaliśmy się w bibliotece 😉
              birth_date: 1999-12-26T21:54:12.5060000+01:00
              gender: 1
              name: Jula
            """;
            return yamlString;
        }

        public string GetYaml03()
        {
            var id = "600eaa77413de801005301a963728e501d5d650100f36d82";
            string yamlString =
            $$"""
            _id: {{id}}
            closed: false
            common_friend_count: 0
            common_like_count: 0
            created_date: 2022-11-15T20:45:28.6660000+01:00
            dead: false
            following: true
            following_moments: true
            has_shown_initial_interest: true
            id: 600eaa77413de801005301a963728e501d5d650100f36d82
            is_archived: false
            is_boost_match: false
            is_experiences_match: false
            is_fast_match: true
            is_matchmaker_match: false
            is_opener: false
            is_preferences_match: false
            is_primetime_boost_match: false
            is_super_boost_match: false
            is_super_like: false
            last_activity_date: 2022-11-17T13:05:43.0550000+01:00
            message_count: 0
            messages:
            - _id: 6373f3c9ad715801005e88dc
              created_date: 2022-11-15T21:17:13.8550000+01:00
              from: 600eaa77413de801005301a9
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: Hej Wojtek ☺️
              sent_date: 2022-11-15T21:17:13.8550000+01:00
              timestamp: 1668543433855
              to: 63728e501d5d650100f36d82
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 6373f5396b69e801004ef8a1
              created_date: 2022-11-15T21:23:21.7260000+01:00
              from: 63728e501d5d650100f36d82
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: Hej Jula
              sent_date: 2022-11-15T21:23:21.7260000+01:00
              timestamp: 1668543801726
              to: 600eaa77413de801005301a9
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 6373f55986edfd01009df548
              created_date: 2022-11-15T21:23:53.9510000+01:00
              from: 600eaa77413de801005301a9
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: Jak Ci mija wieczór? Na spokojnie dzisiaj?
              sent_date: 2022-11-15T21:23:53.9510000+01:00
              timestamp: 1668543833951
              to: 63728e501d5d650100f36d82
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 6373f5decdde8b010041ff45
              created_date: 2022-11-15T21:26:06.0750000+01:00
              from: 600eaa77413de801005301a9
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: Pozwoliłam sobie przejrzeć Twojego instagrama i postanowiłam napisać bo wydajesz się być bardzo otwarta osoba :)
              sent_date: 2022-11-15T21:26:06.0750000+01:00
              timestamp: 1668543966075
              to: 63728e501d5d650100f36d82
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 6373fa88608dc40100e878ce
              created_date: 2022-11-15T21:46:00.3720000+01:00
              from: 63728e501d5d650100f36d82
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: Skąd jesteś?
              sent_date: 2022-11-15T21:46:00.3720000+01:00
              timestamp: 1668545160372
              to: 600eaa77413de801005301a9
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 637400dc876df40100200c69
              created_date: 2022-11-15T22:13:00.6770000+01:00
              from: 600eaa77413de801005301a9
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: Radom
              sent_date: 2022-11-15T22:13:00.6770000+01:00
              timestamp: 1668546780677
              to: 63728e501d5d650100f36d82
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 637400e38a41dd0100a86a72
              created_date: 2022-11-15T22:13:07.9770000+01:00
              from: 600eaa77413de801005301a9
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: Radom
              sent_date: 2022-11-15T22:13:07.9770000+01:00
              timestamp: 1668546787977
              to: 63728e501d5d650100f36d82
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 637603f6e10f620100cc4654
              created_date: 2022-11-17T10:50:46.9460000+01:00
              from: 63728e501d5d650100f36d82
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: To daoeko
              sent_date: 2022-11-17T10:50:46.9460000+01:00
              timestamp: 1668678646946
              to: 600eaa77413de801005301a9
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 637618f3265d620100c30fb0
              created_date: 2022-11-17T12:20:19.5890000+01:00
              from: 600eaa77413de801005301a9
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: No niby daleko
              sent_date: 2022-11-17T12:20:19.5890000+01:00
              timestamp: 1668684019589
              to: 63728e501d5d650100f36d82
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 637618f866237701006cd308
              created_date: 2022-11-17T12:20:23.9980000+01:00
              from: 600eaa77413de801005301a9
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: Ale widzę że latasz
              sent_date: 2022-11-17T12:20:23.9980000+01:00
              timestamp: 1668684023998
              to: 63728e501d5d650100f36d82
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 63761901e925a8010086833c
              created_date: 2022-11-17T12:20:33.6570000+01:00
              from: 600eaa77413de801005301a9
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: My zaraz otwieramy lotnisko XD
              sent_date: 2022-11-17T12:20:33.6570000+01:00
              timestamp: 1668684033657
              to: 63728e501d5d650100f36d82
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 6376221366237701006de096
              created_date: 2022-11-17T12:59:15.7030000+01:00
              from: 63728e501d5d650100f36d82
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: Hahaha chyba za 10 lat xd
              sent_date: 2022-11-17T12:59:15.7030000+01:00
              timestamp: 1668686355703
              to: 600eaa77413de801005301a9
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 6376227ead71580100a10024
              created_date: 2022-11-17T13:01:02.2880000+01:00
              from: 600eaa77413de801005301a9
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: Nie nie nie
              sent_date: 2022-11-17T13:01:02.2880000+01:00
              timestamp: 1668686462288
              to: 63728e501d5d650100f36d82
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 6376229d86edfd0100e0216d
              created_date: 2022-11-17T13:01:33.6770000+01:00
              from: 600eaa77413de801005301a9
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: Mówię Ci na spokera możesz przylecieć, ja Ci nawet załatwię VIP pas do lądowania
              sent_date: 2022-11-17T13:01:33.6770000+01:00
              timestamp: 1668686493677
              to: 63728e501d5d650100f36d82
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 637623646874a7010094858e
              created_date: 2022-11-17T13:04:52.3860000+01:00
              from: 63728e501d5d650100f36d82
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: "Aż tak ci się spodobałem? \U0001F604"
              sent_date: 2022-11-17T13:04:52.3860000+01:00
              timestamp: 1668686692386
              to: 600eaa77413de801005301a9
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 6376237a56a6000100708284
              created_date: 2022-11-17T13:05:14.2620000+01:00
              from: 600eaa77413de801005301a9
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: Staram się nie oceniać po wyglądzie
              sent_date: 2022-11-17T13:05:14.2620000+01:00
              timestamp: 1668686714262
              to: 63728e501d5d650100f36d82
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 63762381a82de40100d980d7
              created_date: 2022-11-17T13:05:21.1250000+01:00
              from: 600eaa77413de801005301a9
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: Ale wyglądasz na miłego gościa
              sent_date: 2022-11-17T13:05:21.1250000+01:00
              timestamp: 1668686721125
              to: 63728e501d5d650100f36d82
              fixed_height: 
              gif_id_for_sending: 
              type: 
            - _id: 637623974745300100265071
              created_date: 2022-11-17T13:05:43.0550000+01:00
              from: 63728e501d5d650100f36d82
              matchId: 600eaa77413de801005301a963728e501d5d650100f36d82
              match_id: 600eaa77413de801005301a963728e501d5d650100f36d82
              message: Miłego haha
              sent_date: 2022-11-17T13:05:43.0550000+01:00
              timestamp: 1668686743055
              to: 600eaa77413de801005301a9
              fixed_height: 
              gif_id_for_sending: 
              type: 
            participants:
            - 600eaa77413de801005301a9
            pending: false
            person:
              _id: 600eaa77413de801005301a9
              bio: >-
                Będę oglądać z Tobą mecze i pić piwo. Specjalnie dla Ciebie mogę zrobić unfollow na Make Life Harder żebyś mógł mi wysyłać stamtąd memy i będziemy śmiać się razem.
                Chętnie będę miała z Tobą psa i będziemy się rano spychać z łóżka kto idzie z nim na spacer. Jak będziesz miał zły dzień przywiozę Ci maka a jak będziesz chory ugotuję rosół. Nie bądź dupkiem a będę o Ciebie dbać i będziemy szczęśliwi XD
                Jak coś to poznaliśmy się w bibliotece 😉
              birth_date: 1999-12-26T21:54:12.5060000+01:00
              gender: 1
              name: Jula
              photos:
              - assets: []
                created_at: 0001-01-01T00:00:00.0000000
                crop_info:
                  user: 
                  algo: 
                  processed_by_bullseye: true
                  user_customized: false
                  faces: 
                dhash: 
                extension: jpg,webp
                fbId: 
                fileName: 51d7d5b0-1487-47ea-bf4b-54f97efc39be.jpg
                id: 51d7d5b0-1487-47ea-bf4b-54f97efc39be
                phash: 
                processedFiles:
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/640x800_51d7d5b0-1487-47ea-bf4b-54f97efc39be.jpg
                  height: 800
                  width: 640
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/320x400_51d7d5b0-1487-47ea-bf4b-54f97efc39be.jpg
                  height: 400
                  width: 320
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/172x216_51d7d5b0-1487-47ea-bf4b-54f97efc39be.jpg
                  height: 216
                  width: 172
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/84x106_51d7d5b0-1487-47ea-bf4b-54f97efc39be.jpg
                  height: 106
                  width: 84
                rank: 0
                score: 0.2162527
                type: image
                updated_at: 0001-01-01T00:00:00.0000000
                url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/original_51d7d5b0-1487-47ea-bf4b-54f97efc39be.jpeg
                webp_qf:
                - 75
                win_count: 8
                jobs: 0
                selfie_verified: 
                image: 
                thumbnail: 
                ts: 
                media_type: image
                processedVideos: 
                last_update_time: 
                xdistance_percent: 0
                xoffset_percent: 0
                ydistance_percent: 0
                yoffset_percent: 0
                main: 
                selectRate: 
                webp_res: 
              - assets: []
                created_at: 0001-01-01T00:00:00.0000000
                crop_info:
                  user: 
                  algo: 
                  processed_by_bullseye: true
                  user_customized: false
                  faces: 
                dhash: 
                extension: jpg,webp
                fbId: 
                fileName: d8bfeb7c-970f-428e-b2c4-94b811362240.jpg
                id: d8bfeb7c-970f-428e-b2c4-94b811362240
                phash: 
                processedFiles:
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/640x800_d8bfeb7c-970f-428e-b2c4-94b811362240.jpg
                  height: 800
                  width: 640
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/320x400_d8bfeb7c-970f-428e-b2c4-94b811362240.jpg
                  height: 400
                  width: 320
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/172x216_d8bfeb7c-970f-428e-b2c4-94b811362240.jpg
                  height: 216
                  width: 172
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/84x106_d8bfeb7c-970f-428e-b2c4-94b811362240.jpg
                  height: 106
                  width: 84
                rank: 1
                score: 0.1856566
                type: image
                updated_at: 0001-01-01T00:00:00.0000000
                url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/original_d8bfeb7c-970f-428e-b2c4-94b811362240.jpeg
                webp_qf:
                - 75
                win_count: 7
                jobs: 0
                selfie_verified: 
                image: 
                thumbnail: 
                ts: 
                media_type: image
                processedVideos: 
                last_update_time: 
                xdistance_percent: 0
                xoffset_percent: 0
                ydistance_percent: 0
                yoffset_percent: 0
                main: 
                selectRate: 
                webp_res: 
              - assets: []
                created_at: 0001-01-01T00:00:00.0000000
                crop_info:
                  user: 
                  algo: 
                  processed_by_bullseye: true
                  user_customized: false
                  faces: 
                dhash: 
                extension: jpg,webp
                fbId: 
                fileName: d124ea6c-859e-4357-b874-162cd28ed822.jpg
                id: d124ea6c-859e-4357-b874-162cd28ed822
                phash: 
                processedFiles:
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/640x800_d124ea6c-859e-4357-b874-162cd28ed822.jpg
                  height: 800
                  width: 640
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/320x400_d124ea6c-859e-4357-b874-162cd28ed822.jpg
                  height: 400
                  width: 320
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/172x216_d124ea6c-859e-4357-b874-162cd28ed822.jpg
                  height: 216
                  width: 172
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/84x106_d124ea6c-859e-4357-b874-162cd28ed822.jpg
                  height: 106
                  width: 84
                rank: 2
                score: 0.17892544
                type: image
                updated_at: 0001-01-01T00:00:00.0000000
                url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/original_d124ea6c-859e-4357-b874-162cd28ed822.jpeg
                webp_qf:
                - 75
                win_count: 6
                jobs: 0
                selfie_verified: 
                image: 
                thumbnail: 
                ts: 
                media_type: image
                processedVideos: 
                last_update_time: 
                xdistance_percent: 0
                xoffset_percent: 0
                ydistance_percent: 0
                yoffset_percent: 0
                main: 
                selectRate: 
                webp_res: 
              - assets: []
                created_at: 0001-01-01T00:00:00.0000000
                crop_info:
                  user:
                    height_pct: 0.8
                    width_pct: 1
                    x_offset_pct: 0
                    y_offset_pct: 0.007182567829731812
                  algo:
                    height_pct: 0.3335399443050846
                    width_pct: 0.30589541462250047
                    x_offset_pct: 0.3055862934328616
                    y_offset_pct: 0.24041259567718953
                  processed_by_bullseye: true
                  user_customized: false
                  faces:
                  - algo:
                      height_pct: 0.3335399443050846
                      width_pct: 0.30589541462250047
                      x_offset_pct: 0.3055862934328616
                      y_offset_pct: 0.24041259567718953
                    bounding_box_percentage: 10.2
                dhash: 
                extension: jpg,webp
                fbId: 
                fileName: b1354421-b8e7-4a72-9cec-4678192fe33d.jpg
                id: b1354421-b8e7-4a72-9cec-4678192fe33d
                phash: 
                processedFiles:
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/640x800_b1354421-b8e7-4a72-9cec-4678192fe33d.jpg
                  height: 800
                  width: 640
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/320x400_b1354421-b8e7-4a72-9cec-4678192fe33d.jpg
                  height: 400
                  width: 320
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/172x216_b1354421-b8e7-4a72-9cec-4678192fe33d.jpg
                  height: 216
                  width: 172
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/84x106_b1354421-b8e7-4a72-9cec-4678192fe33d.jpg
                  height: 106
                  width: 84
                rank: 3
                score: 0.10261077
                type: image
                updated_at: 0001-01-01T00:00:00.0000000
                url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/original_b1354421-b8e7-4a72-9cec-4678192fe33d.jpeg
                webp_qf:
                - 75
                win_count: 5
                jobs: 0
                selfie_verified: 
                image: 
                thumbnail: 
                ts: 
                media_type: image
                processedVideos: 
                last_update_time: 
                xdistance_percent: 0
                xoffset_percent: 0
                ydistance_percent: 0
                yoffset_percent: 0
                main: 
                selectRate: 
                webp_res: 
              - assets: []
                created_at: 0001-01-01T00:00:00.0000000
                crop_info:
                  user: 
                  algo: 
                  processed_by_bullseye: true
                  user_customized: false
                  faces: 
                dhash: 
                extension: jpg,webp
                fbId: 
                fileName: 113b0a35-8a55-4495-8bfc-705f38643fd1.jpg
                id: 113b0a35-8a55-4495-8bfc-705f38643fd1
                phash: 
                processedFiles:
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/640x800_113b0a35-8a55-4495-8bfc-705f38643fd1.jpg
                  height: 800
                  width: 640
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/320x400_113b0a35-8a55-4495-8bfc-705f38643fd1.jpg
                  height: 400
                  width: 320
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/172x216_113b0a35-8a55-4495-8bfc-705f38643fd1.jpg
                  height: 216
                  width: 172
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/84x106_113b0a35-8a55-4495-8bfc-705f38643fd1.jpg
                  height: 106
                  width: 84
                rank: 4
                score: 0.10092546
                type: image
                updated_at: 0001-01-01T00:00:00.0000000
                url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/original_113b0a35-8a55-4495-8bfc-705f38643fd1.jpeg
                webp_qf:
                - 75
                win_count: 4
                jobs: 0
                selfie_verified: 
                image: 
                thumbnail: 
                ts: 
                media_type: image
                processedVideos: 
                last_update_time: 
                xdistance_percent: 0
                xoffset_percent: 0
                ydistance_percent: 0
                yoffset_percent: 0
                main: 
                selectRate: 
                webp_res: 
              - assets: []
                created_at: 0001-01-01T00:00:00.0000000
                crop_info:
                  user:
                    height_pct: 0.8
                    width_pct: 1
                    x_offset_pct: 0
                    y_offset_pct: 0
                  algo:
                    height_pct: 0.08673014841973783
                    width_pct: 0.08620144841261207
                    x_offset_pct: 0.4247940876055509
                    y_offset_pct: 0.18914770111441612
                  processed_by_bullseye: true
                  user_customized: false
                  faces:
                  - algo:
                      height_pct: 0.08673014841973783
                      width_pct: 0.08620144841261207
                      x_offset_pct: 0.4247940876055509
                      y_offset_pct: 0.18914770111441612
                    bounding_box_percentage: 0.75
                dhash: 
                extension: jpg,webp
                fbId: 
                fileName: 026038cd-d315-45fa-99e9-d952b7e13331.jpg
                id: 026038cd-d315-45fa-99e9-d952b7e13331
                phash: 
                processedFiles:
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/640x800_026038cd-d315-45fa-99e9-d952b7e13331.jpg
                  height: 800
                  width: 640
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/320x400_026038cd-d315-45fa-99e9-d952b7e13331.jpg
                  height: 400
                  width: 320
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/172x216_026038cd-d315-45fa-99e9-d952b7e13331.jpg
                  height: 216
                  width: 172
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/84x106_026038cd-d315-45fa-99e9-d952b7e13331.jpg
                  height: 106
                  width: 84
                rank: 5
                score: 0.06737826
                type: image
                updated_at: 0001-01-01T00:00:00.0000000
                url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/original_026038cd-d315-45fa-99e9-d952b7e13331.jpeg
                webp_qf:
                - 75
                win_count: 3
                jobs: 0
                selfie_verified: 
                image: 
                thumbnail: 
                ts: 
                media_type: image
                processedVideos: 
                last_update_time: 
                xdistance_percent: 0
                xoffset_percent: 0
                ydistance_percent: 0
                yoffset_percent: 0
                main: 
                selectRate: 
                webp_res: 
              - assets: []
                created_at: 0001-01-01T00:00:00.0000000
                crop_info:
                  user:
                    height_pct: 0.8
                    width_pct: 1
                    x_offset_pct: 0
                    y_offset_pct: 0
                  algo:
                    height_pct: 0.2991041639447212
                    width_pct: 0.318188881885726
                    x_offset_pct: 0.10686675357865169
                    y_offset_pct: 0.15069698706269263
                  processed_by_bullseye: true
                  user_customized: false
                  faces:
                  - algo:
                      height_pct: 0.2991041639447212
                      width_pct: 0.318188881885726
                      x_offset_pct: 0.10686675357865169
                      y_offset_pct: 0.15069698706269263
                    bounding_box_percentage: 9.52
                dhash: 
                extension: jpg,webp
                fbId: 
                fileName: f59ed87b-bb4c-4df4-b39f-054700ffec5e.jpg
                id: f59ed87b-bb4c-4df4-b39f-054700ffec5e
                phash: 
                processedFiles:
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/640x800_f59ed87b-bb4c-4df4-b39f-054700ffec5e.jpg
                  height: 800
                  width: 640
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/320x400_f59ed87b-bb4c-4df4-b39f-054700ffec5e.jpg
                  height: 400
                  width: 320
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/172x216_f59ed87b-bb4c-4df4-b39f-054700ffec5e.jpg
                  height: 216
                  width: 172
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/84x106_f59ed87b-bb4c-4df4-b39f-054700ffec5e.jpg
                  height: 106
                  width: 84
                rank: 6
                score: 0.05951477
                type: image
                updated_at: 0001-01-01T00:00:00.0000000
                url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/original_f59ed87b-bb4c-4df4-b39f-054700ffec5e.jpeg
                webp_qf:
                - 75
                win_count: 2
                jobs: 0
                selfie_verified: 
                image: 
                thumbnail: 
                ts: 
                media_type: image
                processedVideos: 
                last_update_time: 
                xdistance_percent: 0
                xoffset_percent: 0
                ydistance_percent: 0
                yoffset_percent: 0
                main: 
                selectRate: 
                webp_res: 
              - assets: []
                created_at: 0001-01-01T00:00:00.0000000
                crop_info:
                  user: 
                  algo: 
                  processed_by_bullseye: true
                  user_customized: false
                  faces: 
                dhash: 
                extension: jpg,webp
                fbId: 
                fileName: c7dafe9d-dc58-4803-bf95-2837a1f3f7f0.jpg
                id: c7dafe9d-dc58-4803-bf95-2837a1f3f7f0
                phash: 
                processedFiles:
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/640x800_c7dafe9d-dc58-4803-bf95-2837a1f3f7f0.jpg
                  height: 800
                  width: 640
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/320x400_c7dafe9d-dc58-4803-bf95-2837a1f3f7f0.jpg
                  height: 400
                  width: 320
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/172x216_c7dafe9d-dc58-4803-bf95-2837a1f3f7f0.jpg
                  height: 216
                  width: 172
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/84x106_c7dafe9d-dc58-4803-bf95-2837a1f3f7f0.jpg
                  height: 106
                  width: 84
                rank: 7
                score: 0.05265785
                type: image
                updated_at: 0001-01-01T00:00:00.0000000
                url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/original_c7dafe9d-dc58-4803-bf95-2837a1f3f7f0.jpeg
                webp_qf:
                - 75
                win_count: 1
                jobs: 0
                selfie_verified: 
                image: 
                thumbnail: 
                ts: 
                media_type: image
                processedVideos: 
                last_update_time: 
                xdistance_percent: 0
                xoffset_percent: 0
                ydistance_percent: 0
                yoffset_percent: 0
                main: 
                selectRate: 
                webp_res: 
              - assets: []
                created_at: 0001-01-01T00:00:00.0000000
                crop_info:
                  user: 
                  algo: 
                  processed_by_bullseye: true
                  user_customized: false
                  faces: 
                dhash: 
                extension: jpg,webp
                fbId: 
                fileName: 26c3de94-f192-425a-b2ef-30b7bcb88aa1.jpg
                id: 26c3de94-f192-425a-b2ef-30b7bcb88aa1
                phash: 
                processedFiles:
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/640x800_26c3de94-f192-425a-b2ef-30b7bcb88aa1.jpg
                  height: 800
                  width: 640
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/320x400_26c3de94-f192-425a-b2ef-30b7bcb88aa1.jpg
                  height: 400
                  width: 320
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/172x216_26c3de94-f192-425a-b2ef-30b7bcb88aa1.jpg
                  height: 216
                  width: 172
                - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/84x106_26c3de94-f192-425a-b2ef-30b7bcb88aa1.jpg
                  height: 106
                  width: 84
                rank: 8
                score: 0.036078144
                type: image
                updated_at: 0001-01-01T00:00:00.0000000
                url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/original_26c3de94-f192-425a-b2ef-30b7bcb88aa1.jpeg
                webp_qf:
                - 75
                win_count: 0
                jobs: 0
                selfie_verified: 
                image: 
                thumbnail: 
                ts: 
                media_type: image
                processedVideos: 
                last_update_time: 
                xdistance_percent: 0
                xoffset_percent: 0
                ydistance_percent: 0
                yoffset_percent: 0
                main: 
                selectRate: 
                webp_res: 
              ping_time: 2014-12-09T01:00:00.0000000+01:00
              hide_ads: false
              hide_age: false
              hide_distance: false
            readreceipt:
              enabled: false
            seen:
              last_seen_msg_id: 63762381a82de40100d980d7
              match_seen: true
            liked_content:
              by_closer:
                is_swipe_note: false
                photo:
                  assets: []
                  created_at: 0001-01-01T00:00:00.0000000
                  crop_info:
                    user: 
                    algo: 
                    processed_by_bullseye: true
                    user_customized: false
                    faces: 
                  dhash: 
                  extension: jpg,webp
                  fbId: 
                  fileName: 26c3de94-f192-425a-b2ef-30b7bcb88aa1.jpg
                  id: 26c3de94-f192-425a-b2ef-30b7bcb88aa1
                  phash: 
                  processedFiles:
                  - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/640x800_26c3de94-f192-425a-b2ef-30b7bcb88aa1.jpg
                    height: 800
                    width: 640
                  - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/320x400_26c3de94-f192-425a-b2ef-30b7bcb88aa1.jpg
                    height: 400
                    width: 320
                  - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/172x216_26c3de94-f192-425a-b2ef-30b7bcb88aa1.jpg
                    height: 216
                    width: 172
                  - url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/84x106_26c3de94-f192-425a-b2ef-30b7bcb88aa1.jpg
                    height: 106
                    width: 84
                  rank: 8
                  score: 0.036078144
                  type: image
                  updated_at: 0001-01-01T00:00:00.0000000
                  url: https://images-ssl.gotinder.com/600eaa77413de801005301a9/original_26c3de94-f192-425a-b2ef-30b7bcb88aa1.jpeg
                  webp_qf:
                  - 75
                  win_count: 0
                  jobs: 0
                  selfie_verified: 
                  image: 
                  thumbnail: 
                  ts: 
                  media_type: 
                  processedVideos: 
                  last_update_time: 
                  xdistance_percent: 0
                  xoffset_percent: 0
                  ydistance_percent: 0
                  yoffset_percent: 0
                  main: 
                  selectRate: 
                  webp_res: 
                type: photo
                user_id: 63728e501d5d650100f36d82
              by_opener: 
            subscription_tier: gold
            super_liker: 
            explore_attribution: 
            
            """;
            return yamlString;
        }
    }
}