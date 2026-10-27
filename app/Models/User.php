<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public const DEFAULT_CATEGORIES = [
        ['Gaji', 'income', '#10b981'],
        ['Bonus', 'income', '#22c55e'],
        ['Usaha / Freelance', 'income', '#14b8a6'],
        ['Hasil Investasi', 'income', '#06b6d4'],
        ['Lainnya', 'income', '#64748b'],
        ['Makan & Minum', 'expense', '#f97316'],
        ['Transportasi', 'expense', '#eab308'],
        ['Tagihan & Utilitas', 'expense', '#ef4444'],
        ['Tempat Tinggal', 'expense', '#a855f7'],
        ['Belanja Bulanan', 'expense', '#ec4899'],
        ['Kesehatan', 'expense', '#06b6d4'],
        ['Hiburan', 'expense', '#8b5cf6'],
        ['Sekolah / Pendidikan', 'expense', '#3b82f6'],
        ['Cicilan / Utang', 'expense', '#dc2626'],
        ['Keluarga & Sosial', 'expense', '#f59e0b'],
        ['Biaya Bank', 'expense', '#78716c'],
        ['Lainnya', 'expense', '#64748b'],
    ];

    protected static function booted(): void
    {
        static::created(function (User $user) {
            foreach (self::DEFAULT_CATEGORIES as [$name, $type, $color]) {
                $user->categories()->create(compact('name', 'type', 'color'));
            }
            foreach (array_keys(Category::SYSTEM) as $key) {
                Category::system($user, $key);
            }
        });
    }

    public function accounts(): HasMany
    {
        return $this->hasMany(Account::class);
    }

    public function categories(): HasMany
    {
        return $this->hasMany(Category::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }

    public function budgets(): HasMany
    {
        return $this->hasMany(Budget::class);
    }

    public function goals(): HasMany
    {
        return $this->hasMany(Goal::class);
    }

    public function debts(): HasMany
    {
        return $this->hasMany(Debt::class);
    }

    public function recurringItems(): HasMany
    {
        return $this->hasMany(RecurringItem::class);
    }

    public function receivables(): HasMany
    {
        return $this->hasMany(Receivable::class);
    }

    public function assets(): HasMany
    {
        return $this->hasMany(Asset::class);
    }

    public function scenarios(): HasMany
    {
        return $this->hasMany(Scenario::class);
    }

    public function employmentStatuses(): HasMany
    {
        return $this->hasMany(EmploymentStatus::class)->orderByDesc('since')->orderByDesc('id');
    }

    public function currentEmployment(): ?EmploymentStatus
    {
        return $this->employmentStatuses()->where('since', '<=', today())->first();
    }
}
