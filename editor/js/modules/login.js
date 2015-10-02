var LoginModule = { 
	name: "login",
	server_url: "",
	server_ready: false,
	session: null,

	init: function()
	{
		var loginarea = document.createElement("div");
		loginarea.id = "login-area";
		loginarea.style.lineHeight = "2em";
		loginarea.style.position = "absolute";
		loginarea.style.top = 0;
		loginarea.style.right = 0;
		this.server_path = CORE.config.server;
		this.loginarea = loginarea;
		$("#mainmenubar").append(loginarea);

		LFS.setup( this.server_path, function(v){
			if(!v)
			{
				LiteGUI.alert("Cannot connect with server");
				return;
			}

			LoginModule.server_ready = true;
			LoginModule.checkSession();
		});
	},

	checkSession: function()
	{
		this.loginarea.innerHTML = "...";
		var that = this;

		LFS.checkExistingSession( function(session)	{
			that.setSession(session);
		},	function (err) {
			throw err;
		});
	},

	setSession: function(session)
	{
		if (session)
		{
			this.session = session;
			this.user = session.user;
		}
		this.updateLoginArea();
		$(this).trigger( session ? "user-login" : "user-logout" );
	},

	updateLoginArea: function()
	{
		if (this.user)
		{
			this.loginarea.innerHTML = "logged as <a href='#'>"+this.user.username+"</a> <button class='btn'>Logout</button>";
			$(this.loginarea).find("button").click(function()
			{
				LoginModule.showLogoutDialog();
			});
		}
		else
		{
			this.loginarea.innerHTML = "not logged in <button class='btn'>Login</button>";
			$(this.loginarea).find("button").click(function()
			{
				LoginModule.showLoginDialog();
			});
		}
	},

	showLoginDialog: function()
	{
		var dialog = new LiteGUI.Dialog("dialog_login", {title:"Login", close: true, width: 300, scroll: false, draggable: true});
		dialog.show('fade');

		var widgets = new LiteGUI.Inspector();
		widgets.addString("Username", "", {});
		widgets.addString("Password", "", { password:true });
		widgets.addButton(null,"Login", { callback: inner_login } );
		widgets.addButton(null,"Login as Guest", { callback: inner_login_guest } );
		var info = widgets.addInfo(null,"Enter your account");

		dialog.content.appendChild(widgets.root);

		function inner_login()
		{
			var username = widgets.values["Username"];
			var password = widgets.values["Password"];
			LoginModule.login(username,password, inner_result );
			info.setValue("Waiting server...");
		}

		function inner_login_guest()
		{
			LoginModule.login("guest","guest", inner_result );
			info.setValue("Waiting server...");
		}

		function inner_result(user)
		{
			if(user)
			{
				dialog.close();
			}
			else
				info.setValue("Wrong user/pass");
		}
	},

	showLogoutDialog: function()
	{
		LiteGUI.confirm("Do you want to log out?", inner );
		function inner()
		{
			LoginModule.logout();
		}
	},

	login: function(username, password, callback)
	{
		if(!username || !password)
			return;

		this.loginarea.innerHTML = "...";

		LFS.login( username, password, inner_success, inner_error);

		function inner_success(session, response)
		{
			LoginModule.setSession(session);
			if(callback)
				callback(LoginModule.user);
		}

		function inner_error(err)
		{
			throw err;
		}
	},

	logout: function(callback) {
		if(this.session)
			this.session.logout( inner_success );
		function inner_success()
		{
			LoginModule.session = null;
			LoginModule.user = null;
			LoginModule.updateLoginArea();
			if(callback) 
				callback();
		}
	}
};

CORE.registerModule( LoginModule );