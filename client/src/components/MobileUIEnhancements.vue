<template>
  <div class="mobile-ui-enhancements">
    <!-- モバイル専用フローティングメニュー -->
    <div v-if="isMobile" class="mobile-floating-menu" :class="{ 'menu-open': showMobileMenu }">
      <button 
        class="mobile-menu-toggle"
        @click="toggleMobileMenu"
        :aria-label="showMobileMenu ? 'メニューを閉じる' : 'メニューを開く'"
      >
        <span class="hamburger-icon" :class="{ 'active': showMobileMenu }">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>
      
      <div v-if="showMobileMenu" class="mobile-menu-items">
        <button 
          v-if="debugMode" 
          class="mobile-menu-item"
          @click="$emit('toggle-debug')"
        >
          🔧 デバッグ
        </button>
        <button 
          class="mobile-menu-item"
          @click="$emit('show-game-info')"
        >
          ℹ️ 情報
        </button>
        <button 
          class="mobile-menu-item"
          @click="$emit('show-help')"
        >
          ❓ ヘルプ
        </button>
      </div>
    </div>

    <!-- スマホ用カード詳細プレビュー -->
    <div 
      v-if="isMobile && previewCard" 
      class="mobile-card-preview"
      @click="hideCardPreview"
    >
      <div class="preview-card" @click.stop>
        <div class="preview-header">
          <h4>{{ previewCard.name }}</h4>
          <button class="close-preview" @click="hideCardPreview">×</button>
        </div>
        <div class="preview-content">
          <div class="preview-cost">コスト: {{ previewCard.cost }}</div>
          <div class="preview-effects" v-html="formatCardEffects(previewCard.effects)"></div>
        </div>
      </div>
    </div>

    <!-- スマホ用スワイプジェスチャー検出エリア -->
    <div 
      v-if="isMobile"
      class="swipe-detector"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
    ></div>
  </div>
</template>

<script>
export default {
  name: 'MobileUIEnhancements',
  props: {
    debugMode: {
      type: Boolean,
      default: false
    }
  },
  emits: ['toggle-debug', 'show-game-info', 'show-help', 'card-preview', 'swipe-action'],
  data() {
    return {
      isMobile: false,
      showMobileMenu: false,
      previewCard: null,
      touchStartX: 0,
      touchStartY: 0,
      touchStartTime: 0
    }
  },
  mounted() {
    this.checkMobileDevice()
    window.addEventListener('resize', this.checkMobileDevice)
    
    // 長押しでカード詳細表示のイベントリスナー
    document.addEventListener('contextmenu', this.handleContextMenu)
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.checkMobileDevice)
    document.removeEventListener('contextmenu', this.handleContextMenu)
  },
  methods: {
    checkMobileDevice() {
      this.isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    },
    
    toggleMobileMenu() {
      this.showMobileMenu = !this.showMobileMenu
    },
    
    handleContextMenu(event) {
      if (this.isMobile) {
        event.preventDefault()
        // カード要素の場合は詳細表示
        const cardElement = event.target.closest('.card')
        if (cardElement && cardElement.dataset.cardData) {
          this.showCardPreview(JSON.parse(cardElement.dataset.cardData))
        }
      }
    },
    
    showCardPreview(card) {
      this.previewCard = card
      this.$emit('card-preview', card)
    },
    
    hideCardPreview() {
      this.previewCard = null
    },
    
    handleTouchStart(event) {
      const touch = event.touches[0]
      this.touchStartX = touch.clientX
      this.touchStartY = touch.clientY
      this.touchStartTime = Date.now()
    },
    
    handleTouchMove(event) {
      // スクロール防止（必要に応じて）
      if (this.showMobileMenu) {
        event.preventDefault()
      }
    },
    
    handleTouchEnd(event) {
      const touch = event.changedTouches[0]
      const deltaX = touch.clientX - this.touchStartX
      const deltaY = touch.clientY - this.touchStartY
      const deltaTime = Date.now() - this.touchStartTime
      
      // スワイプジェスチャーの検出（150px以上、500ms以内）
      if (Math.abs(deltaX) > 150 && deltaTime < 500 && Math.abs(deltaY) < 100) {
        const direction = deltaX > 0 ? 'right' : 'left'
        this.$emit('swipe-action', direction)
        
        // 右スワイプでメニュー開閉
        if (direction === 'right' && !this.showMobileMenu) {
          this.showMobileMenu = true
        } else if (direction === 'left' && this.showMobileMenu) {
          this.showMobileMenu = false
        }
      }
    },
    
    formatCardEffects(effects) {
      if (!effects) return ''
      
      // カード効果テキストをモバイル用にフォーマット
      return effects
        .replace(/\n/g, '<br>')
        .replace(/【([^】]+)】/g, '<strong>【$1】</strong>')
        .replace(/★([^★]+)★/g, '<em>★$1★</em>')
    }
  }
}
</script>

<style scoped>
/* モバイルフローティングメニュー */
.mobile-floating-menu {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 1001;
}

.mobile-menu-toggle {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.8);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s;
}

.mobile-menu-toggle:active {
  transform: scale(0.95);
}

/* ハンバーガーアイコン */
.hamburger-icon {
  display: flex;
  flex-direction: column;
  width: 20px;
  height: 15px;
  justify-content: space-between;
}

.hamburger-icon span {
  width: 100%;
  height: 2px;
  background: white;
  transition: all 0.3s;
}

.hamburger-icon.active span:nth-child(1) {
  transform: translateY(6.5px) rotate(45deg);
}

.hamburger-icon.active span:nth-child(2) {
  opacity: 0;
}

.hamburger-icon.active span:nth-child(3) {
  transform: translateY(-6.5px) rotate(-45deg);
}

/* メニューアイテム */
.mobile-menu-items {
  position: absolute;
  top: 60px;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: slideIn 0.3s ease-out;
}

.mobile-menu-item {
  padding: 10px 15px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  white-space: nowrap;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s;
}

.mobile-menu-item:active {
  transform: scale(0.95);
}

/* カードプレビュー */
.mobile-card-preview {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1002;
  padding: 20px;
}

.preview-card {
  background: white;
  border-radius: 12px;
  max-width: 350px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid #eee;
}

.preview-header h4 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.close-preview {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: #f0f0f0;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-content {
  padding: 15px;
}

.preview-cost {
  font-weight: bold;
  color: #0066cc;
  margin-bottom: 10px;
}

.preview-effects {
  line-height: 1.5;
  color: #333;
}

/* スワイプ検出エリア */
.swipe-detector {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 1;
}

/* アニメーション */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
