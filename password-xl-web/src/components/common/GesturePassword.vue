<!--手势密码-->
<script setup lang="ts">
import {GesturePoint, Point} from "@/types";
import {isInCircle} from "@/utils/global.ts";
import {usePasswordStore} from "@/stores/PasswordStore.ts";
import {md5} from "@/utils/security.ts";

const passwordStore = usePasswordStore();

// 声明此组件可能调用的事件
const emits = defineEmits(['complete', 'pass', 'fail'])

let props = defineProps({
  // 验证字符串
  ciphertext: {
    type: String
  },
  // 显示手势
  showGesture: {
    type: Boolean,
    default: true
  }
})

// 全部的点
const allPointArray: Array<GesturePoint> = reactive([])
// 手势划过的点
const passPointArray: Array<GesturePoint> = reactive([])

// 画板div Ref
const gestureDivRef: Ref<HTMLDivElement | undefined> = ref()
// 画板Ref
const canvasRef: Ref<HTMLCanvasElement | undefined> = ref()

// 画笔
let ctx: CanvasRenderingContext2D | undefined = undefined
// 鼠标/手指是否按下
const pressed = ref(false)
// 验证状态
const verifyStatus: Ref<string> = ref('')
// 当前鼠标/手指悬浮的位置
const hoverPoint: Ref<Point | null> = ref(null)

// 组件配置
const config = {
  // 每行/每列手势点数量
  pointCellSize: 3,
  // 手势点在其所在区域的占比
  cellPointRadio: 0.33,
  // 手势点颜色
  gesturePointColor: '#cacaca',
  // 手势点错误时的颜色
  gesturePointErrorColor: '#F56C6C',
  // 圆心占比
  circleCenterRadio: 0.25,
  // 手势点中心颜色
  gesturePointCenterColor: '#409EFF',
  // 手势点中心错误时的颜色
  gesturePointCenterErrorColor: '#F56C6C',
  // 线条宽度
  lineWidth: 12,
  // 线条颜色
  lineColor: 'rgba(64,158,255,0.32)',
  // 线条错误时的颜色
  lineErrorColor: 'rgba(245,108,108,0.32)',
}

// 手势按下
const canvasDown = (_point: Point) => {
  drawCanvas()
}

// 手势移动
const canvasMove = (_point: Point) => {
  drawCanvas()
}

// 手势抬起
const canvasUp = () => {
  let selectPoint = passPointArray.map((point: GesturePoint) => point.id).join()
  verifyPassword(selectPoint)
  drawCanvas()
}

// 验证
const verifyPassword = (mainPassword: string) => {
  if (!props.ciphertext) {
    // 清除手势点
    passPointArray.length = 0

    if (mainPassword.length < 5) {
      console.log('设置密码，手势主密码 请至少连接3个点')
      ElMessage.warning('请至少连接3个点')
      return;
    }

    // 验证方法不存在直接完成
    emits('complete', md5(mainPassword))
    return
  }
  // 验证密码
  verifyStatus.value = passwordStore.passwordManager.verifyPassword(mainPassword, props.ciphertext) ? 'pass' : 'fail'
  // 重绘
  drawCanvas()
  // 验证状态通知
  if (verifyStatus.value) {
    emits('pass', md5(mainPassword))
  } else {
    emits('fail', md5(mainPassword))
  }

  // 验证密码状态0.5秒后清除
  setTimeout(() => {
    // 清除验证状态
    verifyStatus.value = ''
    // 清除手势点
    passPointArray.length = 0
    // 重绘
    drawCanvas()
  }, 500)
}

// 绘制画板
const drawCanvas = () => {
  if (!gestureDivRef.value || !canvasRef.value) return

  // 计算经过点
  calcPassPoint()

  // 清空画板
  clearCanvas()

  // 绘制手势点
  drawGesturePoint()

  if (props.showGesture) {
    // 绘制鼠标悬浮效果
    drawHover();

    // 绘制手势经过的点
    drawPassPoint()

    // 绘制各点连接线
    drawLine()
  }
}

// 绘制连接线
const drawLine = () => {
  if (!ctx) return
  let points: Array<Point> = [...passPointArray]
  // 当鼠标悬浮且鼠标按下且状态不存在，添加当前鼠标点到轨迹中
  if (hoverPoint.value && pressed.value && !verifyStatus.value) {
    points.push(hoverPoint.value)
  }
  if (points.length < 2) {
    return
  }
  for (let i = 1; i < points.length; i++) {
    let startPoint: Point = points[i - 1]
    let endPoint: Point = points[i]

    // 绘制连接线
    ctx.beginPath();
    ctx.strokeStyle = verifyStatus.value === 'fail' ? config.lineErrorColor : config.lineColor
    ctx.lineWidth = config.lineWidth
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(endPoint.x, endPoint.y)
    ctx.stroke();
  }
}

// 计算经过点
const calcPassPoint = () => {
  // 鼠标按下且校验状态为空时校验
  if (!pressed.value || verifyStatus.value === 'fail') return

  // 找出鼠标所在点
  let gesturePoint = fundHoverGesturePoint()
  // 不存在无需计算
  if (!gesturePoint) return

  // 判断该点是否存在经过列表中
  let existPoint = passPointArray.find((pass: GesturePoint) => pass.id === gesturePoint.id)
  if (!existPoint) {
    passPointArray.push(gesturePoint)
  }
}

// 清空画板
const clearCanvas = () => {
  if (!ctx || !canvasRef.value) return
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
}

// 绘制手势经过的点
const drawPassPoint = () => {
  if (!gestureDivRef.value || !canvasRef.value || !ctx) return

  for (let i = 0; i < passPointArray.length; i++) {
    let point: GesturePoint = passPointArray[i]
    drawCircleCenter(point)
  }
}

// 绘制鼠标悬浮效果
const drawHover = () => {
  if (!gestureDivRef.value || !canvasRef.value || !ctx) return
  // 有验证状态或鼠标未悬浮不绘制
  if (verifyStatus.value || !hoverPoint.value) return
  let gesturePoint = fundHoverGesturePoint()
  if (gesturePoint) {
    drawCircleCenter(gesturePoint)
  }
}

// 查找鼠标/手势当前所在点
const fundHoverGesturePoint = (): GesturePoint | null => {
  if (!gestureDivRef.value || !canvasRef.value || !ctx || !hoverPoint.value) return null
  for (let i = 0; i < allPointArray.length; i++) {
    let gesturePoint: GesturePoint = allPointArray[i]
    // 判断鼠标是否在圆形区域
    let inCircle = isInCircle(gesturePoint.x, gesturePoint.y, gesturePoint.radius, hoverPoint.value.x, hoverPoint.value?.y)
    if (inCircle) {
      return gesturePoint
    }
  }
  return null
}

// 画触点圆心
const drawCircleCenter = (gesturePoint: GesturePoint) => {
  if (!ctx) return
  // 绘制外圈
  ctx.beginPath();
  ctx.fillStyle = verifyStatus.value ? config.gesturePointCenterErrorColor : config.gesturePointCenterColor
  ctx.arc(gesturePoint.x, gesturePoint.y, gesturePoint.radius * config.circleCenterRadio, 0, Math.PI * 2);
  ctx.fill();

  // 绘制圆心
  ctx.beginPath();
  ctx.fillStyle = verifyStatus.value ? config.lineErrorColor : config.lineColor
  ctx.arc(gesturePoint.x, gesturePoint.y, gesturePoint.radius * config.circleCenterRadio * 2, 0, Math.PI * 2);
  ctx.fill();

  // 绘制半透明外围
  ctx.beginPath();
  ctx.strokeStyle = verifyStatus.value ? config.gesturePointCenterErrorColor : config.gesturePointCenterColor
  ctx.lineWidth = 2
  ctx.arc(gesturePoint.x, gesturePoint.y, gesturePoint.radius, 0, Math.PI * 2);
  ctx.stroke();
}

// 绘制手势点
const drawGesturePoint = () => {
  if (!ctx) return
  allPointArray.forEach((gesturePoint: GesturePoint) => {
    if (!ctx) return

    // 绘制手势点
    ctx.beginPath();
    ctx.strokeStyle = config.gesturePointColor
    ctx.lineWidth = 2
    ctx.arc(gesturePoint.x, gesturePoint.y, gesturePoint.radius, 0, Math.PI * 2);
    ctx.stroke();

    // 绘制手势点中心
    ctx.beginPath();
    ctx.fillStyle = config.gesturePointColor
    ctx.arc(gesturePoint.x, gesturePoint.y, gesturePoint.radius * config.circleCenterRadio, 0, Math.PI * 2);
    ctx.fill();
  })
}

// 鼠标按下
const mousedown = (e: MouseEvent) => {
  pressed.value = true
  let point = {x: e.offsetX, y: e.offsetY}
  hoverPoint.value = point
  canvasDown(point)
}

// 鼠标移动
const mousemove = (e: MouseEvent) => {
  let point = {x: e.offsetX, y: e.offsetY}
  hoverPoint.value = point
  canvasMove(point)
}

// 鼠标抬起
const mouseup = () => {
  if (!pressed.value) return
  pressed.value = false
  hoverPoint.value = null
  canvasUp()
}

// 鼠标离开
const mouseleave = () => {
  if (!pressed.value) return
  pressed.value = false
  hoverPoint.value = null
  canvasUp()
}

// 手指按下
const touchstart = (e: TouchEvent) => {
  if (!canvasRef.value) return
  pressed.value = true
  let rect = canvasRef.value.getBoundingClientRect()
  let point: Point = {
    x: e.touches[0].clientX - rect.x,
    y: e.touches[0].clientY - rect.y
  }
  hoverPoint.value = point
  canvasDown(point)
}

// 手指移动
const touchmove = (e: TouchEvent) => {
  if (!canvasRef.value) return
  let rect = canvasRef.value.getBoundingClientRect()
  let point: Point = {
    x: e.touches[0].clientX - rect.x,
    y: e.touches[0].clientY - rect.y
  }
  hoverPoint.value = point
  canvasMove(point)
}

// 手指抬起
const touchend = () => {
  if (!pressed.value) return
  pressed.value = false
  hoverPoint.value = null
  canvasUp()
}

function createHDCanvas(canvas: any, w: number, h: number) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = w * ratio; // 实际渲染像素
  canvas.height = h * ratio; // 实际渲染像素
  canvas.style.width = `${w}px`; // 控制显示大小
  canvas.style.height = `${h}px`; // 控制显示大小
  const ctx = canvas.getContext('2d')
  ctx.scale(ratio, ratio)
  return ctx;
}

// 初始化画板
const initCanvas = () => {
  if (!gestureDivRef.value || !canvasRef.value) return

  let size = gestureDivRef.value.clientWidth
  console.log('画板大小：', size)
  canvasRef.value.width = size
  canvasRef.value.height = size

  ctx =  createHDCanvas(canvasRef.value, size, size) as CanvasRenderingContext2D

  let incrId = 0
  allPointArray.length = 0
  // 计算手势点位置
  for (let i = 0; i < config.pointCellSize; i++) {
    for (let j = 0; j < config.pointCellSize; j++) {
      let x = i * size / config.pointCellSize
      let y = j * size / config.pointCellSize
      let w = size / config.pointCellSize
      let h = size / config.pointCellSize
      let gesturePoint: GesturePoint = {
        id: incrId++,
        x: x + w / 2,
        y: y + h / 2,
        radius: w * config.cellPointRadio,
      }
      allPointArray.push(gesturePoint)
    }
  }
  drawCanvas()
}

let resizeTimeout: any = null
window.onresize = () => {
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }
  resizeTimeout = setTimeout(initCanvas, 100);
}

onMounted(() => {
  nextTick(() => {
    initCanvas()
  })
})
</script>

<template>
  <div ref="gestureDivRef" style="width: 100%;height: 100%;">
    <canvas
        ref="canvasRef"
        style="image-rendering: auto;"
        @mousedown="mousedown"
        @mousemove="mousemove"
        @mouseup="mouseup"
        @mouseleave="mouseleave"
        @touchstart="touchstart"
        @touchmove="touchmove"
        @touchend="touchend"
    ></canvas>
  </div>
</template>

<style scoped>

</style>