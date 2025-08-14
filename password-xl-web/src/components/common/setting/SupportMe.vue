<!--支持项目-->
<script lang="ts" setup>
import packageJson from '../../../../package.json'

const donateArray = [
  {name: 'Seeking dream', money: 10, time: '2024-10-11'},
  {name: 'Ching', money: 10, time: '2024-07-13'},
  {name: '李春雨', money: 5, time: '2024-07-12'},
  {name: '张博文', money: 50, time: '2024-07-12'},
]
</script>

<template>
  <h2 style="margin-top: 0">支持我们</h2>
  <el-text size="large" style="text-indent: 20px" tag="p">
    为了帮助您更安全、便捷地管理密码，我们打造了一个开源免费的密码管理工具。在开发和维护过程中，我们面临着诸多困难和挑战。您的支持对项目的发展至关重要，您可以通过以下方式支持此项目：
  </el-text>
  <ul class="support-ul">
    <li>
      <el-text size="large">
        <span class="iconfont icon-praise support-icon" style="color: #E6A23C;"></span>
        在项目
        <el-link :href="packageJson.repository.url" :underline="false"
                 style="font-size: 16px;position: relative;top: -2px" target="_blank" type="primary">开源地址
        </el-link>
        中为项目点赞，增加项目的曝光度。
      </el-text>
    </li>
    <li>
      <el-text size="large">
        <span class="iconfont icon-report support-icon" style="color: #F56C6C;"></span>
        在Github上
        <el-link :href="packageJson.repository.url+'/issues'" :underline="false"
                 style="font-size: 16px;position: relative;top: -2px" target="_blank" type="primary">报告您遇到的错误
        </el-link>
        ，帮助我们持续改进。
      </el-text>
    </li>
    <li>
      <el-text size="large">
        <span class="iconfont icon-idea support-icon" style="color: #67C23A;"></span>
        提出您的
        <el-link :href="packageJson.repository.url+'/issues'" :underline="false"
                 style="font-size: 16px;position: relative;top: -2px" target="_blank" type="primary">建议和想法
        </el-link>
        ，帮助我们更好地满足用户需求。
      </el-text>
    </li>
    <li>
      <el-text size="large">
        <span class="iconfont icon-company support-icon" style="color: #E6A23C;"></span>
        将此工具分享给您的朋友和家人，让更多人受益。
      </el-text>
    </li>
    <li>
      <div style="float:left;">
        <el-text size="large">
          <span class="iconfont icon-money support-icon" style="color: #F56C6C"></span>
        </el-text>
      </div>
      <div style="float:left;width: calc(100% - 40px);padding-left: 5px">
        <el-text size="large">
          如果您认可我们的努力，请考虑给予一些经济上的支持，以帮助我们为您提供更加优质的密码管理体验。
        </el-text>
      </div>
      <div style="clear: both"></div>
    </li>
  </ul>
  <el-row>
    <el-col :md="{span:9}" :sm="{span:24}" :xs="{span:24}" style="text-align: center">
      <div style="text-align: center;">
        <h3 style="margin-top: 4px">微信赞赏码</h3>
        <div style="padding: 5px 20px;text-align: center">
          <img alt="" src="../../../assets/images/donate.png" style="width: 80%;max-width: 300px;border-radius: 50%">
        </div>
      </div>
    </el-col>
    <el-col :md="{span:15}" :sm="{span:24}" :xs="{span:24}" style="text-align: center;padding-right: 10px">
      <h3 style="margin-top: 4px">捐赠者列表</h3>
      <el-table :data="donateArray" border stripe>
        <el-table-column label="名称" prop="name"></el-table-column>
        <el-table-column label="时间" min-width="60px" prop="time"></el-table-column>
        <el-table-column label="金额" min-width="40px" prop="money"></el-table-column>
      </el-table>
    </el-col>
  </el-row>

</template>

<style scoped>
.support-ul {
  padding-left: 18px;
}

.support-ul li {
  list-style: none;
  line-height: 25px;
}

.support-icon {
  margin-right: 5px;
  font-size: 110%;
}
</style>