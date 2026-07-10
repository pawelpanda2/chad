namespace SharpRepoServiceTests.JsonObjects
{
    public class Match
    {
        public string _id { get; set; }
        public bool closed { get; set; }
        public int common_friend_count { get; set; }
        public int common_like_count { get; set; }
        public DateTime created_date { get; set; }
        public bool dead { get; set; }
        public bool following { get; set; }
        public bool following_moments { get; set; }
        public bool has_shown_initial_interest { get; set; }
        public string id { get; set; }
        public bool is_archived { get; set; }
        public bool is_boost_match { get; set; }
        public bool is_experiences_match { get; set; }
        public bool is_fast_match { get; set; }
        public bool is_matchmaker_match { get; set; }
        public bool is_opener { get; set; }
        public bool is_preferences_match { get; set; }
        public bool is_primetime_boost_match { get; set; }
        public bool is_super_boost_match { get; set; }
        public bool is_super_like { get; set; }
        public DateTime last_activity_date { get; set; }
        public int message_count { get; set; }
        public List<Message> messages { get; set; }
        public List<string> participants { get; set; }
        public bool pending { get; set; }
        public Person person { get; set; }
        public Readreceipt readreceipt { get; set; }
        public Seen seen { get; set; }
        public LikedContent liked_content { get; set; }
        public string subscription_tier { get; set; }
        public string super_liker { get; set; }
        public ExploreAttribution explore_attribution { get; set; }
    }

    public class ExploreAttribution
    {
        public string background_url { get; set; }
        public string catalog_id { get; set; }
        public string catalog_type { get; set; }
        public string experience_description { get; set; }
        public string experience_title { get; set; }
        public string logo_url { get; set; }
    }


    public class LikedContent
    {
        public ByCloser by_closer { get; set; }
        public ByOpener by_opener { get; set; }
    }

    public class ByOpener
    {
        public bool is_swipe_note { get; set; }
        public Photo photo { get; set; }
        public string type { get; set; }
        public string user_id { get; set; }
    }


    public class ByCloser
    {
        public bool is_swipe_note { get; set; }
        public Photo photo { get; set; }
        public string type { get; set; }
        public string user_id { get; set; }
    }

    //public class Algo
    //{
    //    public double height_pct { get; set; }
    //    public double width_pct { get; set; }
    //    public double x_offset_pct { get; set; }
    //    public double y_offset_pct { get; set; }
    //}

    //public class CropInfo
    //{
    //    public Algo algo { get; set; }
    //    public List<Face> faces { get; set; }
    //    public bool processed_by_bullseye { get; set; }
    //    public User user { get; set; }
    //    public bool user_customized { get; set; }
    //}

    //public class Face
    //{
    //    public Algo algo { get; set; }
    //    public double bounding_box_percentage { get; set; }
    //}

    public class Message
    {
        public string _id { get; set; }
        public DateTime created_date { get; set; }
        public string from { get; set; }
        public string matchId { get; set; }
        public string match_id { get; set; }
        public string message { get; set; }
        public DateTime sent_date { get; set; }
        public object timestamp { get; set; }
        public string to { get; set; }
        public string fixed_height { get; set; }
        public string gif_id_for_sending { get; set; }
        public string type { get; set; }
    }

    public class Person
    {
        public string _id { get; set; }
        public string bio { get; set; }
        public DateTime birth_date { get; set; }
        public int gender { get; set; }
        public string name { get; set; }
        public List<Photo> photos { get; set; }
        public DateTime ping_time { get; set; }
        public bool hide_ads { get; set; }
        public bool hide_age { get; set; }
        public bool hide_distance { get; set; }
    }

    //public class Photo
    //{
    //    public List<object> assets { get; set; }
    //    public CropInfo crop_info { get; set; }
    //    public string extension { get; set; }
    //    public string fileName { get; set; }
    //    public string id { get; set; }
    //    public string media_type { get; set; }
    //    public List<ProcessedFile> processedFiles { get; set; }
    //    public int rank { get; set; }
    //    public double score { get; set; }
    //    public string type { get; set; }
    //    public string url { get; set; }
    //    public List<int> webp_qf { get; set; }
    //    public int win_count { get; set; }
    //}

    //public class ProcessedFile
    //{
    //    public int height { get; set; }
    //    public string url { get; set; }
    //    public int width { get; set; }
    //}

    public class Readreceipt
    {
        public bool enabled { get; set; }
    }

    public class Seen
    {
        public string last_seen_msg_id { get; set; }
        public bool match_seen { get; set; }
    }

    //public class User
    //{
    //    public double height_pct { get; set; }
    //    public double width_pct { get; set; }
    //    public double x_offset_pct { get; set; }
    //    public double y_offset_pct { get; set; }
    //}
}
