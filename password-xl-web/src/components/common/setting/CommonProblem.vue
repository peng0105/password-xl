<!--常见问题-->
<script setup lang="ts">

</script>

<template>
  <el-collapse>
    <el-collapse-item title="1、主密码忘记了怎么办？">
      <el-text style="text-indent: 15px;display: inline-block">
        很抱歉，由于密码安全机制，主密码一旦忘记没有任何办法查看密码数据。如您需要注销账号可以登录密码存储位置删除密码文件<br>
        <div style="text-indent: 15px">
          <el-text tag="b">oss：</el-text>
          请登录阿里云控制台->对象存储，删除password-xl文件夹
        </div>
        <div style="text-indent: 15px">
          <el-text tag="b">cos：</el-text>
          请登录腾讯云控制台->对象存储，删除password-xl文件夹
        </div>
        <div style="text-indent: 15px">
          <el-text tag="b">私有服务：</el-text>
          请到服务端密码数据存储目录删除您的用户名文件夹
        </div>
        <div style="padding-left: 15px">
          <el-text tag="b">本地存储：</el-text>
          请到 C:\Users\您的用户名\AppData\Roaming\password-xl目录下删除setting.json和store.json两个文件。<br>
          <el-text type="info" size="small">
            <el-alert type="info">AppData是系统隐藏目录，可以通过地址栏输入C:\Users\您的用户名\AppData\Roaming\password-xl直接进入文件夹</el-alert>
          </el-text>
        </div>
      </el-text>
    </el-collapse-item>
    <el-collapse-item title="2、如何私有部署password-XL？">
      <el-text>
        <el-text size="large">项目分为前端和后端两个服务，您可以根据需要选择部署：</el-text>
        <br>
        <el-text tag="b" style="text-indent: 15px;display: inline-block">仅部署前端服务：</el-text>
        可以使用阿里云OSS、腾讯云COS、和本地存储功能<br>
        <el-text tag="b" style="text-indent: 15px;display: inline-block">仅部署后端服务：</el-text>
        可以使用官网提供的页面或安装程序将密码文件存储在您的私有服务中<br>
        <el-text tag="b" style="text-indent: 15px;display: inline-block">两个服务都部署：</el-text>
        可以使用部署的前端页面将密码文件存储在私有服务中<br>
      </el-text>
      <br>
      <el-text>
        <el-text size="large">部署文档：</el-text>
        <div style="padding-left: 15px">
          <el-link type="primary" target="_blank" href="https://gitee.com/huanyp/password-xl/wikis/%E5%90%8E%E7%AB%AF%E9%A1%B9%E7%9B%AE%E9%83%A8%E7%BD%B2%E6%96%87%E6%A1%A3-docker">后端-docker部署</el-link>
          <br>
          <el-link type="primary" target="_blank" href="https://gitee.com/huanyp/password-xl/wikis/%E5%90%8E%E7%AB%AF%E9%A1%B9%E7%9B%AE%E9%83%A8%E7%BD%B2%E6%96%87%E6%A1%A3-jar">后端-jar包部署</el-link>
          <br>
          <el-link type="primary" target="_blank" href="https://gitee.com/huanyp/password-xl/wikis/%E5%89%8D%E7%AB%AF%E9%A1%B9%E7%9B%AE%E9%83%A8%E7%BD%B2%E6%96%87%E6%A1%A3-docker">前端-docker部署</el-link>
          <br>
          <el-link type="primary" target="_blank" href="https://gitee.com/huanyp/password-xl/wikis/%E5%89%8D%E7%AB%AF%E9%A1%B9%E7%9B%AE%E9%83%A8%E7%BD%B2%E6%96%87%E6%A1%A3-nginx">前端-nginx部署</el-link>
        </div>
      </el-text>
    </el-collapse-item>
    <el-collapse-item title="3、每次输入主密码很麻烦，可以自动解锁吗？">
      <el-text style="text-indent: 15px;display: inline-block">
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;您可以在设置-> 密码安全模块中开启自动解锁功能。
      </el-text>
    </el-collapse-item>
    <el-collapse-item title="4、忘记登录信息如何找回？">
      <div style="padding-left: 15px">
        <el-text>
          <el-text tag="b" style="text-indent: 15px;display: inline-block">阿里云OSS：</el-text>
          您可以参考
          <el-link type="primary" target="_blank" style="position: relative;top: -2px" href="https://gitee.com/huanyp/password-xl/wikis/%E9%98%BF%E9%87%8C%E4%BA%91OSS%E6%B3%A8%E5%86%8C%E6%8C%87%E5%BC%95">阿里云OSS注册指引</el-link>
          ，登录阿里云控制台重新创建子账户并在存储桶位置为账号分配权限，密码数据不会丢失<br>
          <el-text tag="b" style="text-indent: 15px;display: inline-block">腾讯云COS：</el-text>
          您可以参考
          <el-link type="primary" target="_blank" style="position: relative;top: -2px" href="https://gitee.com/huanyp/password-xl/wikis/%E8%85%BE%E8%AE%AF%E4%BA%91COS%E6%B3%A8%E5%86%8C%E6%8C%87%E5%BC%95">腾讯云COS注册指引</el-link>
          ，登录腾讯云控制台重新创建子账户并在存储桶位置为账号分配权限，密码数据不会丢失<br>
          <el-text tag="b" style="text-indent: 15px;display: inline-block">私有服务：</el-text>
          您可在服务端项目部署路径下用户配置文件中查看您的登录密码。如果不是您部署项目请联系管理员<br>
        </el-text>
      </div>
    </el-collapse-item>
    <el-collapse-item title="5、如何迁移密码数据？">
      <div style="padding-left: 15px">
        <el-text style="text-indent: 15px;display: inline-block">
          您可以通过
          <el-tag>设置->备份恢复</el-tag>
          菜单下的备份恢复功能迁移密码数据。
        </el-text>
      </div>
    </el-collapse-item>
  </el-collapse>
</template>

<style scoped>

</style>