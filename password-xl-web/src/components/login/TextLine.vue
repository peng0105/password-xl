<script lang="ts" setup>
const prop = defineProps({
  text: {
    type: String
  }
})
</script>

<template>
  <div class="type-line-div">
    <div class="type-line"></div>
    <span class="type-line-item">{{ prop.text }}</span>
    <div class="type-line"></div>
  </div>
</template>

<style scoped>
.type-line-div {
  text-align: center;
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
  width: 100%;
}

.type-line {
  height: 0.01rem;
  background: #bbb;
  width: 30%;
  position: relative;
  top: 10px;
}

.type-line-item {
  color: #666;
  font-size: 14px;
  margin: 0 15px;
}
</style>