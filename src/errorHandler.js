const { app } = require('electron');
const log = require('electron-log');
const Sentry = require('@sentry/electron');
const si = require('systeminformation');

class ErrorHandler {
  constructor() {
    // 配置日志
    log.transports.file.level = 'debug';
    log.transports.console.level = 'debug';
    
    // 初始化 Sentry
    Sentry.init({
      dsn: "https://9b57c84ff800689a9bf7f77af02c43b4@o4509008121430016.ingest.us.sentry.io/4509008123068416",
      enableNative: true,
      debug: false,
      environment: process.env.NODE_ENV,
      beforeSend(event) {
        // 移除敏感信息
        if (event.user) {
          delete event.user.ip_address;
          delete event.user.email;
        }
        return event;
      }
    });
    
    this.setupGlobalHandlers();
  }

  async setupGlobalHandlers() {
    // 捕获未处理的 Promise 异常
    process.on('unhandledRejection', (reason, promise) => {
      log.error('未处理的 Promise 异常:', reason);
      this.reportError('unhandledRejection', reason);
    });

    // 捕获未捕获的异常
    process.on('uncaughtException', (error) => {
      log.error('未捕获的异常:', error);
      this.reportError('uncaughtException', error);
    });

    // 应用退出前记录日志
    app.on('before-quit', () => {
      log.info('应用正在退出');
    });

    // 监听渲染进程错误
    app.on('render-process-gone', (event, webContents, details) => {
      log.error('渲染进程崩溃:', details);
      this.reportError('render-process-gone', details);
    });
  }

  async reportError(type, error) {
    try {
      // 收集系统信息
      const systemInfo = await this.getSystemInfo();
      
      // 发送错误报告到 Sentry
      Sentry.withScope(scope => {
        scope.setExtra('systemInfo', systemInfo);
        scope.setTag('error-type', type);
        Sentry.captureException(error);
      });

      // 本地记录错误
      log.error('错误类型:', type);
      log.error('错误详情:', error);
      log.error('系统信息:', systemInfo);
    } catch (e) {
      log.error('报告错误时发生异常:', e);
    }
  }

  async getSystemInfo() {
    try {
      const [cpu, mem, os] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.osInfo()
      ]);

      return {
        cpu: {
          model: cpu.manufacturer + ' ' + cpu.brand,
          cores: cpu.cores,
          speed: cpu.speed
        },
        memory: {
          total: mem.total,
          free: mem.free,
          used: mem.used
        },
        os: {
          platform: os.platform,
          distro: os.distro,
          release: os.release,
          arch: os.arch
        },
        app: {
          version: app.getVersion(),
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node
        }
      };
    } catch (error) {
      log.error('获取系统信息失败:', error);
      return {};
    }
  }

  handleError(error, context = {}) {
    this.reportError(context.type || 'handled', error);
  }
}

module.exports = new ErrorHandler();