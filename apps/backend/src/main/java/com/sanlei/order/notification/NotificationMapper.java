package com.sanlei.order.notification;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface NotificationMapper {

    @Select("SELECT id, title, content, read_at AS readAt, created_at AS createdAt FROM notifications "
            + "WHERE user_id = #{userId} ORDER BY created_at DESC LIMIT 100")
    List<NotificationRow> listByUser(@Param("userId") String userId);

    @Update("UPDATE notifications SET read_at = #{readAt} WHERE id = #{id} AND user_id = #{userId}")
    int markRead(@Param("id") String id, @Param("userId") String userId, @Param("readAt") String readAt);
}
